import { describe, expect, it } from "vitest";
import { money } from "../../kernel/money";
import { categoryRow } from "./category-row";
import type { SheetBudget, SheetCategory } from "./category-sheet";
import { moveChange, movePlan, moveStart, READY_TO_ASSIGN } from "./move-money";

const usd = (dollars: number) => money(Math.round(dollars * 100), "USD");
const october = "2026-10" as const;

function category(
  name: string,
  { assigned = 0, spending = 0, carriedForward = 0 },
): SheetCategory {
  return {
    id: name.toLowerCase(),
    name,
    groupId: "group",
    groupName: "Group",
    lastMonth: usd(0),
    row: categoryRow({
      carriedForward: usd(carriedForward),
      takenBack: usd(0),
      assigned: usd(assigned),
      spending: usd(spending),
    }),
  };
}

const budget = (categories: SheetCategory[]): SheetBudget => ({
  readyToAssign: usd(500),
  categories,
});

const rent = category("Rent", { assigned: 100 });
const dining = category("Dining", { assigned: 10, spending: 28 });
const holiday = category("Holiday", { carriedForward: 600 });

describe("moveStart", () => {
  it("starts on covering the first Overspent Category from Ready to Assign", () => {
    expect(moveStart(budget([rent, dining]))).toEqual({
      from: READY_TO_ASSIGN,
      to: "dining",
      amount: usd(18),
    });
  });

  it("starts on the first Category, with no amount, when nothing is Overspent", () => {
    expect(moveStart(budget([rent, holiday]))).toEqual({
      from: READY_TO_ASSIGN,
      to: "rent",
      amount: undefined,
    });
  });
});

describe("movePlan", () => {
  const all = budget([rent, dining, holiday]);

  it("shows both ends after moving between Categories", () => {
    const plan = movePlan(all, "rent", "dining", usd(30), october);
    expect(plan.ends).toEqual([
      { name: "Rent", after: usd(70) },
      { name: "Dining", after: usd(12) },
    ]);
    expect(plan.refusal).toBeUndefined();
    expect(plan.note).toBe(
      "Lowers Rent's October Assignment from $100.00 to $70.00.",
    );
  });

  it("counts Ready to Assign as an end, with no note when money leaves it", () => {
    const plan = movePlan(all, READY_TO_ASSIGN, "rent", usd(30), october);
    expect(plan.ends).toEqual([
      { name: "Ready to Assign", after: usd(470) },
      { name: "Rent", after: usd(130) },
    ]);
    expect(plan.note).toBeUndefined();
  });

  it("says when the money is a Take-back", () => {
    expect(movePlan(all, "holiday", "rent", usd(42.5), october).note).toBe(
      "Takes $42.50 back from what Holiday carried forward. Its October Assignment stays $0.00.",
    );
  });

  it("refuses more than the Category has to give", () => {
    const plan = movePlan(all, "rent", "holiday", usd(100.01), october);
    expect(plan.refusal).toBe("Rent has $100.00 that can move.");
    expect(plan.note).toBeUndefined();
  });

  it("won't move anything between an end and itself, or nothing at all", () => {
    expect(movePlan(all, "rent", "rent", usd(10), october).ready).toBe(false);
    expect(movePlan(all, "rent", "holiday", usd(0), october).ready).toBe(false);
    expect(movePlan(all, "rent", "holiday", undefined, october).ready).toBe(
      false,
    );
    expect(movePlan(all, "rent", "holiday", usd(10), october).ready).toBe(true);
  });
});

describe("moveChange", () => {
  const all = budget([rent, holiday]);

  it("moves between two Categories", () => {
    expect(moveChange(all, "rent", "holiday", usd(10))).toEqual({
      kind: "move",
      fromCategoryId: "rent",
      toCategoryId: "holiday",
      amount: usd(10),
    });
  });

  it("raises the Assignment when the money comes from Ready to Assign", () => {
    expect(moveChange(all, READY_TO_ASSIGN, "rent", usd(10))).toEqual({
      kind: "assign",
      categoryId: "rent",
      amount: usd(110),
    });
  });

  it("lowers the Assignment, even below zero, when the money goes to Ready to Assign", () => {
    expect(moveChange(all, "holiday", READY_TO_ASSIGN, usd(10))).toEqual({
      kind: "assign",
      categoryId: "holiday",
      amount: usd(-10),
    });
  });
});
