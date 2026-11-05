import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import {
  adjustments,
  balanceChecks,
  type OpeningBalance,
  openingBalances,
} from "../accounts";
import { currentTransfers } from "../transfers/records";
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

/** A Transfer as a list shows it, once, whichever Accounts it is listed for. */
export type TransferEntry = {
  kind: "transfer";
  id: string;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  /** Always above zero. */
  amount: Money;
  memo?: string;
};

/** A re-declared balance as a list shows it: the Adjustment it made. */
export type AdjustmentEntry = {
  kind: "adjustment";
  /** The id of the record that re-declared the balance. */
  id: string;
  accountId: string;
  /** The day the balance was re-declared. */
  date: string;
  amount: Money;
  /** The balance the user re-declared. */
  balance: Money;
};

/** A re-declared balance that matched, as a list shows it. */
export type BalanceCheckEntry = {
  kind: "balance-check";
  /** The id of the record that re-declared the balance. */
  id: string;
  accountId: string;
  /** The day the balance was re-declared. */
  date: string;
  balance: Money;
};

/** What an Account held when it was added, as a list shows it. */
export type OpeningBalanceEntry = { kind: "opening-balance" } & OpeningBalance;

export type TransactionListEntry =
  | ({ kind: "transaction" } & Transaction)
  | TransferEntry
  | AdjustmentEntry
  | BalanceCheckEntry
  | OpeningBalanceEntry;

/**
 * Everything that moved money in one Account, or in every Account when none is
 * named: Transactions, Transfers (each once), Adjustments, Balance checks and
 * Opening Balances, newest date first. On the same date the most recently
 * recorded comes first; an edit keeps its place. Expects records oldest first,
 * as `readAll` returns them.
 */
export function transactionList(
  records: readonly ChangeRecord[],
  accountId?: string,
): TransactionListEntry[] {
  // Keyed by subject for Transactions and Transfers, by record for what the Accounts slice lists.
  const firstRecorded = new Map<string, number>();
  records.forEach(({ id, subjectId }, index) => {
    if (!firstRecorded.has(subjectId)) firstRecorded.set(subjectId, index);
    firstRecorded.set(id, index);
  });
  const inAccount = (entry: { accountId: string }) =>
    accountId === undefined || entry.accountId === accountId;
  const transfers: TransferEntry[] = [];
  for (const [id, transfer] of currentTransfers(records)) {
    if (
      accountId !== undefined &&
      transfer.fromAccountId !== accountId &&
      transfer.toAccountId !== accountId
    ) {
      continue;
    }
    transfers.push({ kind: "transfer", id, ...transfer });
  }
  const recorded = (id: string) => firstRecorded.get(id) ?? 0;
  const entries: TransactionListEntry[] = [
    ...currentTransactions(records)
      .filter(inAccount)
      .map((transaction) => ({ kind: "transaction", ...transaction }) as const),
    ...transfers,
    ...adjustments(records)
      .filter(inAccount)
      .map((adjustment) => ({ kind: "adjustment", ...adjustment }) as const),
    ...balanceChecks(records)
      .filter(inAccount)
      .map((check) => ({ kind: "balance-check", ...check }) as const),
    ...openingBalances(records)
      .filter(inAccount)
      .map((opening) => ({ kind: "opening-balance", ...opening }) as const),
  ];
  return entries.sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? 1
        : -1
      : recorded(b.id) - recorded(a.id),
  );
}

/** Every Payee the Budget's Transactions name, once each, in alphabetical order. */
export function payees(records: readonly ChangeRecord[]): string[] {
  const named = new Set<string>();
  for (const { payee } of currentTransactions(records)) {
    if (payee) named.add(payee);
  }
  return [...named].sort(new Intl.Collator().compare);
}
