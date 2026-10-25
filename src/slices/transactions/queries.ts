import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import { isTransactionRecorded } from "./records";

export type Transaction = {
  id: string;
  accountId: string;
  date: string;
  amount: Money;
  categoryId?: string;
  payee?: string;
  memo?: string;
};

/**
 * An Account's Transactions, newest date first. On the same date the most
 * recently recorded comes first. Expects records oldest first, as `readAll`
 * returns them.
 */
export function accountTransactions(
  records: readonly ChangeRecord[],
  accountId: string,
): Transaction[] {
  return records
    .filter(isTransactionRecorded)
    .filter((record) => record.payload.accountId === accountId)
    .map(({ subjectId, payload: { version: _, ...transaction } }) => ({
      id: subjectId,
      ...transaction,
    }))
    .reverse()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
