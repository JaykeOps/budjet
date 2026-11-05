/**
 * Undo writes compensating records, never a restore (docs/adr/0006). Each of
 * these makes a change and returns what undoes it, for a toast's `onUndo`. An
 * Undo throws if a change on another device has ruled it out, such as deleting
 * the thing or closing its Account, and the toast says so.
 */
import { useMemo } from "react";
import type { ChangeLogWriter } from "./kernel/change-log";
import { formatMoney, money } from "./kernel/money";
import { type Month, monthNameAlone, previousMonth } from "./kernel/month";
import { useChangeLogWriter } from "./kernel/use-change-log-query";
import {
  deleteRedeclaredBalance,
  restoreRedeclaredBalance,
} from "./slices/accounts/commands";
import {
  type AssignmentInput,
  copyLastMonth,
  type MoveMoneyInput,
  moveMoney,
  restoreAssignment,
  setAssignment,
} from "./slices/assignments/commands";
import {
  assignmentSubject,
  currentAssignments,
} from "./slices/assignments/records";
import { categoryGroups } from "./slices/categories";
import type { TransactionInput } from "./slices/transactions";
import {
  deleteTransaction,
  editTransaction,
  restoreTransaction,
} from "./slices/transactions/commands";
import {
  type CurrentTransaction,
  currentTransactions,
} from "./slices/transactions/records";
import type { TransferInput } from "./slices/transfers";
import {
  deleteTransfer,
  editTransfer,
  restoreTransfer,
} from "./slices/transfers/commands";
import { currentTransfers } from "./slices/transfers/records";
import { useToast } from "./ui/Toast";

export type Undo = () => void;

function transactionNow(
  writer: ChangeLogWriter,
  id: string,
): CurrentTransaction {
  const now = currentTransactions(writer.changeLog.readAll()).find(
    (transaction) => transaction.id === id,
  );
  if (!now) throw new RangeError(`No Transaction ${id}`);
  return now;
}

function transferNow(writer: ChangeLogWriter, id: string): TransferInput {
  const now = currentTransfers(writer.changeLog.readAll()).get(id);
  if (!now) throw new RangeError(`No Transfer ${id}`);
  return now;
}

/** Undoing writes the previous values as a new record. */
export function editTransactionWithUndo(
  writer: ChangeLogWriter,
  id: string,
  input: TransactionInput,
): Undo {
  const previous = transactionNow(writer, id);
  editTransaction(writer, id, input);
  return () => editTransaction(writer, id, previous);
}

/** Undoing writes a new Transaction, with a fresh id, in the same place. */
export function deleteTransactionWithUndo(
  writer: ChangeLogWriter,
  id: string,
): Undo {
  const deleted = transactionNow(writer, id);
  deleteTransaction(writer, id);
  return () => {
    restoreTransaction(writer, deleted);
  };
}

/** Undoing writes the previous details as a new record. */
export function editTransferWithUndo(
  writer: ChangeLogWriter,
  id: string,
  input: TransferInput,
): Undo {
  const previous = transferNow(writer, id);
  editTransfer(writer, id, input);
  return () => editTransfer(writer, id, previous);
}

/** Undoing writes a new Transfer, with a fresh id, in the same place. */
export function deleteTransferWithUndo(
  writer: ChangeLogWriter,
  id: string,
): Undo {
  const deleted = transferNow(writer, id);
  deleteTransfer(writer, id);
  return () => {
    restoreTransfer(writer, id, deleted);
  };
}

/** Undoing writes the same balance, with a fresh id, in the same place in the Change Log. */
export function deleteRedeclaredBalanceWithUndo(
  writer: ChangeLogWriter,
  recordId: string,
): Undo {
  deleteRedeclaredBalance(writer, recordId);
  return () => {
    restoreRedeclaredBalance(writer, recordId);
  };
}

export type Place = { categoryId: string; month: Month };

/** Notes the Assignment and Take-back at each place, and returns what writes them back. */
export function rememberMoney(writer: ChangeLogWriter, places: Place[]): Undo {
  const current = currentAssignments(writer.changeLog.readAll());
  const remembered = places.map((place) => {
    const now = current.get(assignmentSubject(place.categoryId, place.month));
    return { ...place, assigned: now?.assigned, takenBack: now?.takenBack };
  });
  return () => {
    for (const place of remembered) restoreAssignment(writer, place);
  };
}

/** Undoing writes the previous Assignment and Take-back as new records. */
export function setAssignmentWithUndo(
  writer: ChangeLogWriter,
  input: AssignmentInput,
): Undo {
  const undo = rememberMoney(writer, [input]);
  setAssignment(writer, input);
  return undo;
}

/** Undoing writes both Categories' previous Assignments and Take-backs. */
export function moveMoneyWithUndo(
  writer: ChangeLogWriter,
  input: MoveMoneyInput,
): Undo {
  const { fromCategoryId, toCategoryId, month } = input;
  const undo = rememberMoney(writer, [
    { categoryId: fromCategoryId, month },
    { categoryId: toCategoryId, month },
  ]);
  moveMoney(writer, input);
  return undo;
}

/** Undoing empties what it filled. A Category it left alone has nothing to write back. */
export function copyLastMonthWithUndo(
  writer: ChangeLogWriter,
  input: Parameters<typeof copyLastMonth>[1],
): { copied: number; undo: Undo } {
  const { month } = input;
  const lastMonth = previousMonth(month);
  const places = [...currentAssignments(writer.changeLog.readAll()).values()]
    .filter((current) => current.month === lastMonth)
    .map(({ categoryId }) => ({ categoryId, month }));
  const undo = rememberMoney(writer, places);
  return { copied: copyLastMonth(writer, input), undo };
}

/** What the Budget's Assignments do when changed: the change, and its toast with Undo. */
export function useAssignmentChanges() {
  const writer = useChangeLogWriter();
  const toast = useToast();
  return useMemo(() => {
    const nameOf = (id: string) =>
      categoryGroups(writer.changeLog.readAll())
        .flatMap(({ categories }) => categories)
        .find((category) => category.id === id)?.name ?? "that Category";
    return {
      onAssign(input: AssignmentInput) {
        const { amount, categoryId } = input;
        const size = formatMoney(
          money(Math.abs(amount.minorUnits), amount.currency),
        );
        const name = nameOf(categoryId);
        toast({
          text:
            amount.minorUnits < 0
              ? `Took ${size} back from ${name}`
              : `Assigned ${size} to ${name}`,
          onUndo: setAssignmentWithUndo(writer, input),
        });
      },
      onMoveMoney(input: MoveMoneyInput) {
        const { amount, fromCategoryId, toCategoryId } = input;
        toast({
          text: `Moved ${formatMoney(amount)} from ${nameOf(fromCategoryId)} to ${nameOf(toCategoryId)}`,
          onUndo: moveMoneyWithUndo(writer, input),
        });
      },
      onCopyLastMonth(month: Month, skipping: Iterable<string>) {
        const { copied, undo } = copyLastMonthWithUndo(writer, {
          month,
          skipping,
        });
        if (copied === 0) return;
        const assignments = copied === 1 ? "Assignment" : "Assignments";
        toast({
          text: `Copied ${copied} ${assignments} from ${monthNameAlone(previousMonth(month))}`,
          onUndo: undo,
        });
      },
    };
  }, [writer, toast]);
}

/** What a history's rows do when changed: the change, and its toast with Undo. */
export function useHistoryChanges() {
  const writer = useChangeLogWriter();
  const toast = useToast();
  return useMemo(
    () => ({
      onEdit(id: string, input: TransactionInput) {
        toast({
          text: "Changes saved",
          onUndo: editTransactionWithUndo(writer, id, input),
        });
      },
      onDelete(id: string) {
        toast({
          text: "Transaction deleted",
          onUndo: deleteTransactionWithUndo(writer, id),
        });
      },
      onEditTransfer(id: string, input: TransferInput) {
        toast({
          text: "Changes saved",
          onUndo: editTransferWithUndo(writer, id, input),
        });
      },
      onDeleteTransfer(id: string) {
        toast({
          text: "Transfer deleted",
          onUndo: deleteTransferWithUndo(writer, id),
        });
      },
      onDeleteRedeclaredBalance(recordId: string, what: string) {
        toast({
          text: `${what} deleted`,
          onUndo: deleteRedeclaredBalanceWithUndo(writer, recordId),
        });
      },
    }),
    [writer, toast],
  );
}
