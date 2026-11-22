/**
 * Undo writes compensating records, never a restore (docs/adr/0006). Each of
 * these makes a change and returns what undoes it, for a toast's `onUndo`. An
 * Undo throws if a change on another device has ruled it out, such as deleting
 * the thing or closing its Account, and the toast says so.
 */
import { useMemo } from "react";
import type { DeviceChangeLog } from "./kernel/change-log";
import type {
  CategoryId,
  RecordId,
  TransactionId,
  TransferId,
} from "./kernel/id";
import { formatMoney, money } from "./kernel/money";
import { type Month, monthNameAlone, previousMonth } from "./kernel/month";
import { useDeviceChangeLog } from "./kernel/use-change-log-query";
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
  log: DeviceChangeLog,
  id: TransactionId,
): CurrentTransaction {
  const now = currentTransactions(log.readAll()).find(
    (transaction) => transaction.id === id,
  );
  if (!now) throw new RangeError(`No Transaction ${id}`);
  return now;
}

function transferNow(log: DeviceChangeLog, id: TransferId): TransferInput {
  const now = currentTransfers(log.readAll()).get(id);
  if (!now) throw new RangeError(`No Transfer ${id}`);
  return now;
}

/** Undoing writes the previous values as a new record. */
export function editTransactionWithUndo(
  log: DeviceChangeLog,
  id: TransactionId,
  input: TransactionInput,
): Undo {
  const previous = transactionNow(log, id);
  editTransaction(log, id, input);
  return () => editTransaction(log, id, previous);
}

/** Undoing writes a new Transaction, with a fresh id, in the same place. */
export function deleteTransactionWithUndo(
  log: DeviceChangeLog,
  id: TransactionId,
): Undo {
  const deleted = transactionNow(log, id);
  deleteTransaction(log, id);
  return () => {
    restoreTransaction(log, deleted);
  };
}

/** Undoing writes the previous details as a new record. */
export function editTransferWithUndo(
  log: DeviceChangeLog,
  id: TransferId,
  input: TransferInput,
): Undo {
  const previous = transferNow(log, id);
  editTransfer(log, id, input);
  return () => editTransfer(log, id, previous);
}

/** Undoing writes a new Transfer, with a fresh id, in the same place. */
export function deleteTransferWithUndo(
  log: DeviceChangeLog,
  id: TransferId,
): Undo {
  const deleted = transferNow(log, id);
  deleteTransfer(log, id);
  return () => {
    restoreTransfer(log, id, deleted);
  };
}

/** Undoing writes the same balance, with a fresh id, in the same place in the Change Log. */
export function deleteRedeclaredBalanceWithUndo(
  log: DeviceChangeLog,
  recordId: RecordId,
): Undo {
  deleteRedeclaredBalance(log, recordId);
  return () => {
    restoreRedeclaredBalance(log, recordId);
  };
}

export type Place = { categoryId: CategoryId; month: Month };

/** Notes the Assignment and Take-back at each place, and returns what writes them back. */
export function rememberMoney(log: DeviceChangeLog, places: Place[]): Undo {
  const current = currentAssignments(log.readAll());
  const remembered = places.map((place) => {
    const now = current.get(assignmentSubject(place.categoryId, place.month));
    return { ...place, assigned: now?.assigned, takenBack: now?.takenBack };
  });
  return () => {
    for (const place of remembered) restoreAssignment(log, place);
  };
}

/** Undoing writes the previous Assignment and Take-back as new records. */
export function setAssignmentWithUndo(
  log: DeviceChangeLog,
  input: AssignmentInput,
): Undo {
  const undo = rememberMoney(log, [input]);
  setAssignment(log, input);
  return undo;
}

/** Undoing writes both Categories' previous Assignments and Take-backs. */
export function moveMoneyWithUndo(
  log: DeviceChangeLog,
  input: MoveMoneyInput,
): Undo {
  const { fromCategoryId, toCategoryId, month } = input;
  const undo = rememberMoney(log, [
    { categoryId: fromCategoryId, month },
    { categoryId: toCategoryId, month },
  ]);
  moveMoney(log, input);
  return undo;
}

/** Undoing empties what it filled. A Category it left alone has nothing to write back. */
export function copyLastMonthWithUndo(
  log: DeviceChangeLog,
  input: Parameters<typeof copyLastMonth>[1],
): { copied: number; undo: Undo } {
  const { month } = input;
  const lastMonth = previousMonth(month);
  const places = [...currentAssignments(log.readAll()).values()]
    .filter((current) => current.month === lastMonth)
    .map(({ categoryId }) => ({ categoryId, month }));
  const undo = rememberMoney(log, places);
  return { copied: copyLastMonth(log, input), undo };
}

/** What the Budget's Assignments do when changed: the change, and its toast with Undo. */
export function useAssignmentChanges() {
  const log = useDeviceChangeLog();
  const toast = useToast();
  return useMemo(() => {
    const nameOf = (id: string) =>
      categoryGroups(log.readAll())
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
          onUndo: setAssignmentWithUndo(log, input),
        });
      },
      onMoveMoney(input: MoveMoneyInput) {
        const { amount, fromCategoryId, toCategoryId } = input;
        toast({
          text: `Moved ${formatMoney(amount)} from ${nameOf(fromCategoryId)} to ${nameOf(toCategoryId)}`,
          onUndo: moveMoneyWithUndo(log, input),
        });
      },
      onCopyLastMonth(month: Month, skipping: Iterable<CategoryId>) {
        const { copied, undo } = copyLastMonthWithUndo(log, {
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
  }, [log, toast]);
}

/** What a history's rows do when changed: the change, and its toast with Undo. */
export function useHistoryChanges() {
  const log = useDeviceChangeLog();
  const toast = useToast();
  return useMemo(
    () => ({
      onEdit(id: TransactionId, input: TransactionInput) {
        toast({
          text: "Changes saved",
          onUndo: editTransactionWithUndo(log, id, input),
        });
      },
      onDelete(id: TransactionId) {
        toast({
          text: "Transaction deleted",
          onUndo: deleteTransactionWithUndo(log, id),
        });
      },
      onEditTransfer(id: TransferId, input: TransferInput) {
        toast({
          text: "Changes saved",
          onUndo: editTransferWithUndo(log, id, input),
        });
      },
      onDeleteTransfer(id: TransferId) {
        toast({
          text: "Transfer deleted",
          onUndo: deleteTransferWithUndo(log, id),
        });
      },
      onDeleteRedeclaredBalance(recordId: RecordId, what: string) {
        toast({
          text: `${what} deleted`,
          onUndo: deleteRedeclaredBalanceWithUndo(log, recordId),
        });
      },
    }),
    [log, toast],
  );
}
