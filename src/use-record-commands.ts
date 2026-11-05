import { formatMoney } from "./kernel/money";
import { useChangeLogWriter } from "./kernel/use-change-log-query";
import type { TransactionInput } from "./slices/transactions";
import {
  deleteTransaction,
  recordTransaction,
} from "./slices/transactions/commands";
import type { TransferInput } from "./slices/transfers";
import { deleteTransfer, makeTransfer } from "./slices/transfers/commands";
import { useToast } from "./ui/Toast";

/** Recording a Transaction and making a Transfer, each saying what it did in a toast with Undo. */
export function useRecordCommands() {
  const writer = useChangeLogWriter();
  const toast = useToast();
  return {
    record(input: TransactionInput) {
      const id = recordTransaction(writer, input);
      const sign = input.amount.minorUnits > 0 ? "+" : "";
      const payee = input.payee?.trim();
      toast({
        text: `Recorded ${sign}${formatMoney(input.amount)}${payee ? ` at ${payee}` : ""}`,
        onUndo: () => deleteTransaction(writer, id),
      });
    },
    transfer(input: TransferInput) {
      const id = makeTransfer(writer, input);
      toast({
        text: "Transfer made",
        onUndo: () => deleteTransfer(writer, id),
      });
    },
  };
}
