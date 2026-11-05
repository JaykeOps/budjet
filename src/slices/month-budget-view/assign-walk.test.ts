import { describe, expect, it } from "vitest";
import { money } from "../../kernel/money";
import { copyPreview, walkQueue } from "./assign-walk";
import { type CategoryAmounts, categoryRow } from "./category-row";
import type { SheetBudget, SheetCategory } from "./category-sheet";

const usd = (dollars: number) => money(Math.round(dollars * 100), "USD");

/** A Category with an Assignment set this Month unless `nothingAssigned`. */
function category(
  name: string,
  {
    nothingAssigned = false,
    lastMonth = 0,
    ...amounts
  }: Partial<Record<keyof CategoryAmounts, number>> & {
    nothingAssigned?: boolean;
    lastMonth?: number;
  } = {},
): SheetCategory {
  const {
    carriedForward = 0,
    takenBack = 0,
    assigned = 0,
    spending = 0,
  } = amounts;
  return {
    id: name,
    name,
    groupId: "group",
    groupName: "Group",
    lastMonth: usd(lastMonth),
    nothingAssigned,
    row: categoryRow({
      carriedForward: usd(carriedForward),
      takenBack: usd(takenBack),
      assigned: usd(assigned),
      spending: usd(spending),
    }),
  };
}

const budget = (
  readyToAssign: number,
  categories: SheetCategory[],
): SheetBudget => ({ readyToAssign: usd(readyToAssign), categories });

describe("the Assign walk's list", () => {
  it("is Overspent Categories, then those with nothing assigned, each in Budget order", () => {
    const queue = walkQueue(
      budget(100, [
        category("Empty", { nothingAssigned: true }),
        category("Done", { assigned: 50 }),
        category("Over", { assigned: 10, spending: 30 }),
        category("Also empty", { nothingAssigned: true, carriedForward: 20 }),
        category("Also over", { assigned: 5, spending: 6 }),
      ]),
    );

    expect(queue).toEqual(["Over", "Also over", "Empty", "Also empty"]);
  });

  it("asks once about an Overspent Category with nothing assigned, as Overspent", () => {
    const queue = walkQueue(
      budget(100, [
        category("Empty", { nothingAssigned: true }),
        category("Over and empty", { nothingAssigned: true, spending: 30 }),
      ]),
    );

    expect(queue).toEqual(["Over and empty", "Empty"]);
  });

  it("leaves out a Category whose Assignment was set to zero", () => {
    expect(walkQueue(budget(100, [category("Zero", { assigned: 0 })]))).toEqual(
      [],
    );
  });

  it("offers nothing to take back from at zero or above", () => {
    expect(walkQueue(budget(0, [category("Full", { assigned: 50 })]))).toEqual(
      [],
    );
  });

  it("below zero, ends with Categories that have money to take back, most Available first", () => {
    const queue = walkQueue(
      budget(-75, [
        category("Some", { assigned: 50 }),
        category("Spent", { assigned: 40, spending: 40 }),
        category("Most", { carriedForward: 300, assigned: 0 }),
        category("Over", { assigned: 10, spending: 30 }),
        category("Empty", { nothingAssigned: true, carriedForward: 900 }),
      ]),
    );

    expect(queue).toEqual(["Over", "Empty", "Most", "Some"]);
  });
});

describe("Copy last Month's preview", () => {
  const november = [
    category("Rent", { nothingAssigned: true, lastMonth: 1200 }),
    category("Groceries", { assigned: 250, lastMonth: 300 }),
    category("Power", { nothingAssigned: true, lastMonth: 80 }),
    category("Gym", { nothingAssigned: true }),
    category("Phone", { assigned: 0, lastMonth: 40 }),
  ];

  it("lists only Categories with nothing assigned this Month and something assigned last Month", () => {
    const { lines } = copyPreview(budget(2000, november), new Set());

    expect(lines).toEqual([
      { id: "Rent", name: "Rent", amount: usd(1200), ticked: true },
      { id: "Power", name: "Power", amount: usd(80), ticked: true },
    ]);
  });

  it("shows Ready to Assign after copying what's ticked", () => {
    const all = copyPreview(budget(2000, november), new Set());
    expect(all.copying).toBe(2);
    expect(all.readyToAssignAfter).toEqual(usd(720));
    expect(all.warning).toBeUndefined();

    const someUnticked = copyPreview(budget(2000, november), new Set(["Rent"]));
    expect(someUnticked.copying).toBe(1);
    expect(someUnticked.readyToAssignAfter).toEqual(usd(1920));
    expect(someUnticked.lines.map(({ ticked }) => ticked)).toEqual([
      false,
      true,
    ]);
  });

  it("warns in the spec's words when that goes below zero", () => {
    const { readyToAssignAfter, warning } = copyPreview(
      budget(1105, november),
      new Set(),
    );

    expect(readyToAssignAfter).toEqual(usd(-175));
    expect(warning).toBe(
      "That's $175.00 more than you have. Untick a Category, or take it back from one afterwards.",
    );
  });

  it("doesn't warn at exactly zero", () => {
    expect(copyPreview(budget(1280, november), new Set()).warning).toBe(
      undefined,
    );
  });
});
