/**
 * Undo writes compensating records, never a restore (docs/adr/0006). Each of
 * these makes a change and returns what undoes it, for a toast's `onUndo`. An
 * Undo throws if a change on another device has ruled it out, such as deleting
 * the thing or closing its Account, and the toast says so.
 */
import { useMemo } from "react";
import type { ChangeLogWriter } from "./kernel/change-log";
import { useChangeLogWriter } from "./kernel/use-change-log-query";
import {
  deleteRedeclaredBalance,
  restoreRedeclaredBalance,
} from "./slices/accounts/commands";
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
