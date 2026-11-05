import {
  formatMoney,
  type Money,
  money,
  subtractMoney,
} from "../../kernel/money";
import type { SheetBudget } from "./category-sheet";

/**
 * What the Assign walk steps through: Overspent Categories, then those with
 * nothing assigned this Month, then, below zero, those with money to take back,
 * most Available first. Each comes up once.
 */
export function walkQueue({
  readyToAssign,
  categories,
}: SheetBudget): string[] {
  const overspent = categories.filter(({ row }) => row.state === "overspent");
  const empty = categories.filter(
    ({ row, nothingAssigned }) => nothingAssigned && row.state !== "overspent",
  );
  const asked = [...overspent, ...empty];
  const toTakeBackFrom =
    readyToAssign.minorUnits < 0
      ? categories
          .filter(
            (category) =>
              !asked.includes(category) &&
              category.row.available.minorUnits > 0,
          )
          .sort(
            (a, b) => b.row.available.minorUnits - a.row.available.minorUnits,
          )
      : [];
  return [...asked, ...toTakeBackFrom].map(({ id }) => id);
}

export type CopyLine = {
  id: string;
  name: string;
  amount: Money;
  ticked: boolean;
};

/**
 * What Copy last Month would do: each Category it would fill, which is one with
 * nothing assigned this Month and something assigned last Month, and Ready to
 * Assign after copying those still ticked.
 */
export function copyPreview(
  { readyToAssign, categories }: SheetBudget,
  unticked: ReadonlySet<string>,
) {
  const lines: CopyLine[] = categories
    .filter(
      ({ nothingAssigned, lastMonth }) =>
        nothingAssigned && lastMonth.minorUnits > 0,
    )
    .map(({ id, name, lastMonth }) => ({
      id,
      name,
      amount: lastMonth,
      ticked: !unticked.has(id),
    }));
  const copied = lines.filter(({ ticked }) => ticked);
  const readyToAssignAfter = copied.reduce(
    (left, { amount }) => subtractMoney(left, amount),
    readyToAssign,
  );
  const over = -readyToAssignAfter.minorUnits;
  return {
    lines,
    copying: copied.length,
    readyToAssignAfter,
    warning:
      over > 0
        ? `That's ${formatMoney(money(over, readyToAssign.currency))} more than you have. Untick a Category, or take it back from one afterwards.`
        : undefined,
  };
}
