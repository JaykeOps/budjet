import { describe, expect, it } from "vitest";
import { money } from "../../kernel/money";
import { spentChart } from "./spent-chart";
import type { SpentThisMonth } from "./spent-this-month";

const usd = (dollars: number) => money(dollars * 100, "USD");

function card(of: number, daily: [string, number][]): SpentThisMonth {
  return {
    spent: usd(daily.reduce((sum, [, dollars]) => sum + dollars, 0)),
    of: usd(of),
    daily: daily.map(([date, dollars]) => ({ date, spending: usd(dollars) })),
    recorded: daily.length > 0,
  };
}

const october22 = new Date(2026, 9, 22, 12);

describe("spentChart", () => {
  it("runs from zero up to today, carrying the total over days with no Transactions", () => {
    const chart = spentChart(
      card(1000, [
        ["2026-10-02", 100],
        ["2026-10-04", 50],
      ]),
      "2026-10",
      new Date(2026, 9, 5, 12),
    );

    expect(chart.running).toEqual([0, 0, 10_000, 10_000, 15_000, 15_000]);
    expect(chart.days).toBe(31);
  });

  it("steps down on a refund", () => {
    const { running } = spentChart(
      card(1000, [
        ["2026-10-01", 100],
        ["2026-10-02", -40],
      ]),
      "2026-10",
      new Date(2026, 9, 2, 12),
    );

    expect(running).toEqual([0, 10_000, 6_000]);
  });

  it("extends the axis below zero only when the total goes there", () => {
    const above = spentChart(
      card(1000, [["2026-10-01", 100]]),
      "2026-10",
      october22,
    );
    expect(above.low).toBe(0);
    expect(above.high).toBe(100_000);

    const below = spentChart(
      card(1000, [["2026-10-01", -300]]),
      "2026-10",
      october22,
    );
    expect(below.low).toBe(-30_000);
    expect(below.high).toBe(100_000);
  });

  it("raises the axis past the Assignments when Spending goes over them", () => {
    const { high } = spentChart(
      card(100, [["2026-10-01", 250]]),
      "2026-10",
      october22,
    );
    expect(high).toBe(25_000);
  });

  it("counts the days left in the current Month only", () => {
    const spent = card(100, [["2026-10-01", 10]]);
    expect(spentChart(spent, "2026-10", october22).daysToGo).toBe(9);
    expect(
      spentChart(spent, "2026-10", new Date(2026, 10, 3, 12)).daysToGo,
    ).toBeUndefined();
  });

  it("runs a past Month to its last day", () => {
    const { running } = spentChart(
      card(100, [["2026-02-03", 10]]),
      "2026-02",
      october22,
    );
    expect(running).toHaveLength(29);
    expect(running.at(-1)).toBe(1_000);
  });

  it("reaches a Transaction dated later than today", () => {
    const { running } = spentChart(
      card(100, [["2026-10-25", 10]]),
      "2026-10",
      october22,
    );
    expect(running).toHaveLength(26);
  });
});
