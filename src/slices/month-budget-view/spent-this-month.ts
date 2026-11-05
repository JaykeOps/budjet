import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import { addMoney, type Money, money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { assignment } from "../assignments";
import { budget } from "../budget-setup";
import { spending } from "../budget-totals";
import { categoryGroups } from "../categories";
import { currentTransactions } from "../transactions/records";
import { visibleCategoryGroups } from "./visible-categories";

export type DailySpending = {
  /** A calendar date, "YYYY-MM-DD". */
  date: string;
  /** That day's net Spending, which is negative when refunds outweigh money going out. */
  spending: Money;
};

export type SpentThisMonth = {
  /** The Month's Spending. It isn't clamped, so it can be negative. */
  spent: Money;
  /** The Month's Assignments. */
  of: Money;
  /** Net Spending on each day with a counted Transaction, oldest first. */
  daily: DailySpending[];
};

/**
 * What the Spent this Month card shows, summed over the Budget's rows without
 * the Category Groups left out of it. A Category counts by the Category Group
 * it is in now, even for past Months, because Category Groups keep no history.
 * Undefined before a Budget exists.
 */
export function spentThisMonth(
  records: readonly ChangeRecord[],
  of: Month,
): SpentThisMonth | undefined {
  const currency = budget(records)?.currency;
  if (!currency) return undefined;
  const counted = new Set(
    visibleCategoryGroups(categoryGroups(records))
      .filter(({ leftOutOfSpentThisMonth }) => !leftOutOfSpentThisMonth)
      .flatMap(({ categories }) => categories.map(({ id }) => id)),
  );

  const zero = money(0, currency);
  let spent = zero;
  let assigned = zero;
  for (const id of counted) {
    spent = addMoney(spent, spending(records, id, of) ?? zero);
    assigned = addMoney(assigned, assignment(records, id, of) ?? zero);
  }

  const byDay = new Map<string, number>();
  for (const { categoryId, date, amount } of currentTransactions(records)) {
    if (categoryId && counted.has(categoryId) && date.startsWith(`${of}-`)) {
      byDay.set(date, (byDay.get(date) ?? 0) - amount.minorUnits);
    }
  }
  const daily = [...byDay.keys()].sort().map((date) => ({
    date,
    spending: money(byDay.get(date) ?? 0, currency),
  }));

  return { spent, of: assigned, daily };
}

export function useSpentThisMonth(of: Month): SpentThisMonth | undefined {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => spentThisMonth(records, of),
      [of],
    ),
  );
}
