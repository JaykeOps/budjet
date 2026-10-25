import type { ChangeRecord } from "../../kernel/change-log";
import { type CurrentTransaction, currentTransactions } from "./records";

export type Transaction = CurrentTransaction;

/**
 * An Account's Transactions, newest date first. On the same date the most
 * recently recorded comes first; an edit keeps its place. Expects records
 * oldest first, as `readAll` returns them.
 */
export function accountTransactions(
  records: readonly ChangeRecord[],
  accountId: string,
): Transaction[] {
  return currentTransactions(records)
    .filter((transaction) => transaction.accountId === accountId)
    .reverse()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Every Payee the Budget's Transactions name, once each, in alphabetical order. */
export function payees(records: readonly ChangeRecord[]): string[] {
  const named = new Set<string>();
  for (const { payee } of currentTransactions(records)) {
    if (payee) named.add(payee);
  }
  return [...named].sort(new Intl.Collator().compare);
}
