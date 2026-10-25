import type { ChangeRecord } from "../../kernel/change-log";
import { type Money, money } from "../../kernel/money";
import { currentTransfers } from "../transfers/records";
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

/** A Transfer as one Account's Transaction list shows it. */
export type TransferEntry = {
  kind: "transfer";
  id: string;
  date: string;
  /** Negative when the Transfer took money out of this Account, positive when it brought money in. */
  amount: Money;
  /** The Account at the Transfer's other end. */
  otherAccountId: string;
  memo?: string;
};

export type TransactionListEntry =
  | ({ kind: "transaction" } & Transaction)
  | TransferEntry;

/**
 * What an Account's Transaction list shows: its Transactions and the
 * Transfers in and out of it, newest date first. On the same date the most
 * recently recorded comes first. Expects records oldest first, as `readAll`
 * returns them.
 */
export function accountTransactionList(
  records: readonly ChangeRecord[],
  accountId: string,
): TransactionListEntry[] {
  const firstRecorded = new Map<string, number>();
  records.forEach(({ subjectId }, index) => {
    if (!firstRecorded.has(subjectId)) firstRecorded.set(subjectId, index);
  });
  const transfers: TransferEntry[] = [];
  for (const [id, transfer] of currentTransfers(records)) {
    const out = transfer.fromAccountId === accountId;
    if (!out && transfer.toAccountId !== accountId) continue;
    const { minorUnits, currency } = transfer.amount;
    transfers.push({
      kind: "transfer",
      id,
      date: transfer.date,
      amount: money(out ? -minorUnits : minorUnits, currency),
      otherAccountId: out ? transfer.toAccountId : transfer.fromAccountId,
      ...(transfer.memo && { memo: transfer.memo }),
    });
  }
  const recorded = (id: string) => firstRecorded.get(id) ?? 0;
  const entries: TransactionListEntry[] = [
    ...accountTransactions(records, accountId).map(
      (transaction) => ({ kind: "transaction", ...transaction }) as const,
    ),
    ...transfers,
  ];
  return entries.sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? 1
        : -1
      : recorded(b.id) - recorded(a.id),
  );
}
