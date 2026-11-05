import { currentMonth, daysInMonth, type Month } from "../../kernel/month";
import type { SpentThisMonth } from "./spent-this-month";

export type SpentChart = {
  /** Days in the Month: where the even pace reaches the Month's Assignments. */
  days: number;
  /**
   * Spending so far at the end of each day, in minor units, with `running[d]`
   * for day `d` and `running[0]` the zero it starts from. A refund steps it down.
   */
  running: number[];
  /** The bottom of the axis: zero, unless the running total goes below it. */
  low: number;
  /** The top of the axis: the Month's Assignments, or Spending if that's more. */
  high: number;
  /** Days left, only while this is the current Month. */
  daysToGo: number | undefined;
};

/**
 * The Spent this Month chart in numbers. `daily` lists only days with a counted
 * Transaction, so this fills the gaps. The line runs to today in the current
 * Month and to the last day of a past one, and always reaches the latest
 * Transaction, even one dated ahead of today.
 */
export function spentChart(
  { of, daily }: SpentThisMonth,
  month: Month,
  now: Date = new Date(),
): SpentChart {
  const days = daysInMonth(month);
  const thisMonth = currentMonth(now);
  const today =
    month === thisMonth ? now.getDate() : month < thisMonth ? days : 0;
  const byDay = new Map(
    daily.map(({ date, spending }) => [
      Number(date.slice(-2)),
      spending.minorUnits,
    ]),
  );
  const lastDay = Math.max(today, ...byDay.keys());

  const running = [0];
  for (let day = 1; day <= lastDay; day++) {
    running.push(running[day - 1] + (byDay.get(day) ?? 0));
  }
  return {
    days,
    running,
    low: Math.min(0, ...running),
    high: Math.max(of.minorUnits, ...running, 1),
    daysToGo: month === thisMonth ? days - today : undefined,
  };
}
