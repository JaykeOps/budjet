/**
 * The change records Transactions publishes. Other slices may read them; they
 * are versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";

/**
 * Money going out of (a negative amount) or coming in to (a positive amount)
 * an Account on a calendar date ("YYYY-MM-DD"), which puts it in that date's
 * Month. Money going out always has a Category; money coming in without one
 * goes to Ready to Assign. Its subject is the Transaction's id.
 */
export type TransactionRecorded = ChangeRecord<
  "TransactionRecorded",
  {
    version: 1;
    accountId: string;
    date: string;
    amount: Money;
    categoryId?: string;
    payee?: string;
    memo?: string;
  }
>;

export function isTransactionRecorded(
  record: ChangeRecord,
): record is TransactionRecorded {
  return record.type === "TransactionRecorded";
}
