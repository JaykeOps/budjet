import {
  addMoney,
  formatMoney,
  type Money,
  money,
  subtractMoney,
} from "../../kernel/money";
import type { Month } from "../../kernel/month";
import {
  loweringNote,
  type SheetBudget,
  type SheetCategory,
  shortBy,
} from "./category-sheet";

/** Stands for Ready to Assign among the Category ids in From and To. */
export const READY_TO_ASSIGN = "ready-to-assign";

const find = (budget: SheetBudget, id: string): SheetCategory | undefined =>
  budget.categories.find((category) => category.id === id);

/** Where Move money opens: on covering the first Overspent Category, if any. */
export function moveStart({ categories }: SheetBudget) {
  const overspent = categories.find(({ row }) => row.state === "overspent");
  return {
    from: READY_TO_ASSIGN,
    to: (overspent ?? categories[0])?.id ?? READY_TO_ASSIGN,
    amount: overspent && shortBy(overspent.row),
  };
}

/** What moving `amount` would do, and whether it can go ahead. */
export function movePlan(
  budget: SheetBudget,
  from: string,
  to: string,
  amount: Money | undefined,
  of: Month,
) {
  const { currency } = budget.readyToAssign;
  const moving = amount ?? money(0, currency);
  const source = find(budget, from);
  const target = find(budget, to);
  const canMove = money(
    Math.max(0, source?.row.available.minorUnits ?? 0),
    currency,
  );
  const refusal =
    source && moving.minorUnits > canMove.minorUnits
      ? `${source.name} has ${formatMoney(canMove)} that can move.`
      : undefined;
  return {
    ends: [
      {
        name: source?.name ?? "Ready to Assign",
        after: subtractMoney(
          source?.row.available ?? budget.readyToAssign,
          moving,
        ),
      },
      {
        name: target?.name ?? "Ready to Assign",
        after: addMoney(target?.row.available ?? budget.readyToAssign, moving),
      },
    ],
    refusal,
    note:
      source && from !== to && moving.minorUnits > 0 && !refusal
        ? loweringNote(source, moving, of)
        : undefined,
    ready: from !== to && moving.minorUnits > 0 && !refusal,
  };
}

export type MoveChange =
  | { kind: "assign"; categoryId: string; amount: Money }
  | {
      kind: "move";
      fromCategoryId: string;
      toCategoryId: string;
      amount: Money;
    };

/**
 * The write behind a move. Ready to Assign isn't a Category, so an end there
 * changes the other end's Assignment, and below zero that's a Take-back.
 */
export function moveChange(
  budget: SheetBudget,
  from: string,
  to: string,
  amount: Money,
): MoveChange {
  const assignedTo = (id: string) =>
    find(budget, id)?.row.assigned ?? money(0, amount.currency);
  if (from === READY_TO_ASSIGN) {
    return {
      kind: "assign",
      categoryId: to,
      amount: addMoney(assignedTo(to), amount),
    };
  }
  if (to === READY_TO_ASSIGN) {
    return {
      kind: "assign",
      categoryId: from,
      amount: subtractMoney(assignedTo(from), amount),
    };
  }
  return { kind: "move", fromCategoryId: from, toCategoryId: to, amount };
}
