/**
 * The change records Transactions publishes. Other slices may read them; they
 * are versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import {
  type ChangeRecord,
  latestBySubject,
  perSnapshot,
} from "../../kernel/change-log";
import type { Money } from "../../kernel/money";

/** What a Transaction says: its Account, date, amount, and optional Category, Payee and memo. */
type TransactionFields = {
  accountId: string;
  /** A calendar date, "YYYY-MM-DD". */
  date: string;
  /** Negative for money going out of the Account, positive for money coming in. */
  amount: Money;
  categoryId?: string;
  payee?: string;
  memo?: string;
};

/**
 * Money going out of (a negative amount) or coming in to (a positive amount)
 * an Account on a calendar date ("YYYY-MM-DD"), which puts it in that date's
 * Month. Money going out always has a Category; money coming in without one
 * goes to Ready to Assign. Its subject is the Transaction's id.
 */
export type TransactionRecorded = ChangeRecord<
  "TransactionRecorded",
  { version: 1 } & TransactionFields
>;

/**
 * A Transaction as it stands after an edit: every field, not only the
 * changed ones, so the most recent record alone says what the Transaction is.
 * Its subject is the Transaction's id.
 */
export type TransactionEdited = ChangeRecord<
  "TransactionEdited",
  { version: 1 } & TransactionFields
>;

/** A Transaction removed from the Budget. Its subject is the Transaction's id. */
export type TransactionDeleted = ChangeRecord<
  "TransactionDeleted",
  { version: 1 }
>;

export function isTransactionRecorded(
  record: ChangeRecord,
): record is TransactionRecorded {
  return record.type === "TransactionRecorded";
}

export function isTransactionEdited(
  record: ChangeRecord,
): record is TransactionEdited {
  return record.type === "TransactionEdited";
}

export function isTransactionDeleted(
  record: ChangeRecord,
): record is TransactionDeleted {
  return record.type === "TransactionDeleted";
}

/** A Transaction as it stands now, with its id. */
export type CurrentTransaction = { id: string } & TransactionFields;

/**
 * Every Transaction as it stands now, in the order they were first recorded.
 * For each one the most recent record wins (docs/adr/0004): an edit replaces
 * it and a deletion removes it. Every slice that counts Transactions reads
 * them through this. Expects records oldest first, as `readAll` returns them.
 *
 * It lives here, not in queries.ts, only because Budget Totals reads it:
 * Budget Totals depending on Transactions' index would close the cycle
 * Transactions → Categories → Budget Totals → Transactions.
 */
export const currentTransactions = perSnapshot(foldTransactions);

function foldTransactions(
  records: readonly ChangeRecord[],
): readonly CurrentTransaction[] {
  const latest = latestBySubject(
    records.filter(
      (record) =>
        isTransactionRecorded(record) ||
        isTransactionEdited(record) ||
        isTransactionDeleted(record),
    ),
  );
  const current: CurrentTransaction[] = [];
  for (const record of records) {
    if (!isTransactionRecorded(record)) continue;
    const now = latest.get(record.subjectId);
    // Deleting drops it from `latest`, so a repeated TransactionRecorded is skipped too.
    latest.delete(record.subjectId);
    if (now === undefined || isTransactionDeleted(now)) continue;
    const { version: _, ...fields } = (
      now as TransactionRecorded | TransactionEdited
    ).payload;
    current.push({ id: record.subjectId, ...fields });
  }
  return current;
}
