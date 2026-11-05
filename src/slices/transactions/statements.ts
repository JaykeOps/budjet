import type { ChangeRecord } from "../../kernel/change-log";
import { type Money, money } from "../../kernel/money";
import { type Month, monthOf } from "../../kernel/month";
import { isBudgetCreated } from "../budget-setup/records";
import { type TransactionListEntry, transactionList } from "./queries";

/** One Month of history, as a bank's statement reads it. */
export type Statement = {
  month: Month;
  /** Always zero or above. */
  moneyIn: Money;
  /** Always zero or above. */
  moneyOut: Money;
  /** What the Account, or every Account together, held by the Month's last day. */
  endedAt: Money;
  /** Newest first. */
  entries: TransactionListEntry[];
};

/**
 * The history of one Account, or of every Account when none is named, a
 * Statement per Month that has any, newest first. Each ends at what was there
 * by its last day, so a Transaction recorded late changes the Months it falls
 * before, and the newest ends at the balance now. Across every Account a
 * Transfer moves no money, so it is neither in nor out. Expects records oldest
 * first, as `readAll` returns them.
 */
export function statements(
  records: readonly ChangeRecord[],
  accountId?: string,
): Statement[] {
  const currency = records.findLast(isBudgetCreated)?.payload.currency;
  if (!currency) return [];

  const byMonth = new Map<
    Month,
    { moneyIn: number; moneyOut: number; entries: TransactionListEntry[] }
  >();
  for (const entry of transactionList(records, accountId)) {
    const month = monthOf(entry.date);
    let statement = byMonth.get(month);
    if (!statement) {
      statement = { moneyIn: 0, moneyOut: 0, entries: [] };
      byMonth.set(month, statement);
    }
    statement.entries.push(entry);
    const moved = movedBy(entry, accountId);
    if (moved > 0) statement.moneyIn += moved;
    else statement.moneyOut -= moved;
  }

  // Each Month ends at the balance before it plus what it moved, so add up from the oldest.
  // Accounts' ledger can't serve this: it replays records in the order they
  // were written, so it knows only the balance now, never the balance by a date.
  let balance = 0;
  return [...byMonth]
    .reverse()
    .map(([month, { moneyIn, moneyOut, entries }]) => {
      balance += moneyIn - moneyOut;
      return {
        month,
        moneyIn: money(moneyIn, currency),
        moneyOut: money(moneyOut, currency),
        endedAt: money(balance, currency),
        entries,
      };
    })
    .reverse();
}

/** What an entry did to the Account's balance, or to the total across every Account. */
function movedBy(entry: TransactionListEntry, accountId?: string): number {
  switch (entry.kind) {
    case "balance-check":
      return 0;
    case "transfer":
      if (entry.fromAccountId === accountId) return -entry.amount.minorUnits;
      if (entry.toAccountId === accountId) return entry.amount.minorUnits;
      return 0;
    default:
      return entry.amount.minorUnits;
  }
}
