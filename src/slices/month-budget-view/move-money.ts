import { asId, type CategoryId } from "../../kernel/id";
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

/** One end of a move: a Category, or Ready to Assign. */
export type MoveEnd = CategoryId | typeof READY_TO_ASSIGN;

/** The end a From or To picker's value names. */
export function moveEnd(value: string): MoveEnd {
  return value === READY_TO_ASSIGN ? READY_TO_ASSIGN : asId<CategoryId>(value);
}

const find = (budget: SheetBudget, id: MoveEnd): SheetCategory | undefined =>
  budget.categories.find((category) => category.id === id);

/** Where Move money opens: on covering the first Overspent Category, if any. */
export function moveStart({ categories }: SheetBudget): {
  from: MoveEnd;
  to: MoveEnd;
  amount?: Money;
} {
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
  from: MoveEnd,
  to: MoveEnd,
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
  | { kind: "assign"; categoryId: CategoryId; amount: Money }
  | {
      kind: "move";
      fromCategoryId: CategoryId;
      toCategoryId: CategoryId;
      amount: Money;
    };

/**
 * The write behind a move. Ready to Assign isn't a Category, so an end there
 * changes the other end's Assignment, and below zero that's a Take-back.
 */
export function moveChange(
  budget: SheetBudget,
  from: MoveEnd,
  to: MoveEnd,
  amount: Money,
): MoveChange {
  const assignedTo = (id: CategoryId) =>
    find(budget, id)?.row.assigned ?? money(0, amount.currency);
  if (from === to) {
    throw new RangeError("Move money between two different Categories");
  }
  if (from === READY_TO_ASSIGN && to !== READY_TO_ASSIGN) {
    return {
      kind: "assign",
      categoryId: to,
      amount: addMoney(assignedTo(to), amount),
    };
  }
  if (to === READY_TO_ASSIGN && from !== READY_TO_ASSIGN) {
    return {
      kind: "assign",
      categoryId: from,
      amount: subtractMoney(assignedTo(from), amount),
    };
  }
  if (from === READY_TO_ASSIGN || to === READY_TO_ASSIGN) {
    throw new RangeError("Move money between two different Categories");
  }
  return { kind: "move", fromCategoryId: from, toCategoryId: to, amount };
}
