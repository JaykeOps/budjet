import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import {
  addMoney,
  type Currency,
  formatMoney,
  type Money,
  money,
  subtractMoney,
} from "../../kernel/money";
import { type Month, previousMonth } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { assignment, takeBack } from "../assignments";
import { available, spending } from "../budget-totals";

export type CategoryAmounts = {
  carriedForward: Money;
  takenBack: Money;
  assigned: Money;
  spending: Money;
};

export type CategoryRow = CategoryAmounts & {
  /** What it had to spend this Month: carried forward − Take-back + Assignment. */
  had: Money;
  available: Money;
  state: "available" | "zero" | "overspent";
  /** How full its bar of Spending is, from 0 to 1. */
  meter: number;
  /** The line under the bar. */
  note: string;
  /** What it carried forward and had taken back, when either isn't zero. */
  carried: string | undefined;
};

/**
 * How a Category reads on the Budget. Overspent always wins, even over negative
 * Spending, whose meter is otherwise empty.
 */
export function categoryRow(amounts: CategoryAmounts): CategoryRow {
  const { carriedForward, takenBack, assigned, spending } = amounts;
  const had = addMoney(subtractMoney(carriedForward, takenBack), assigned);
  const left = subtractMoney(had, spending);
  const state =
    left.minorUnits < 0
      ? "overspent"
      : left.minorUnits === 0
        ? "zero"
        : "available";
  return {
    ...amounts,
    had,
    available: left,
    state,
    meter: state === "overspent" ? 1 : meter(spending, had),
    note: note(spending, assigned, had, left),
    carried: carriedLine(carriedForward, takenBack),
  };
}

function meter(spending: Money, had: Money): number {
  if (spending.minorUnits <= 0 || had.minorUnits <= 0) return 0;
  return Math.min(spending.minorUnits / had.minorUnits, 1);
}

function note(
  spending: Money,
  assigned: Money,
  had: Money,
  left: Money,
): string {
  if (left.minorUnits < 0) {
    return `Overspent by ${formatMoney(money(-left.minorUnits, left.currency))}`;
  }
  if (spending.minorUnits < 0) return `${formatMoney(spending)} spent`;
  if (assigned.minorUnits === 0 && had.minorUnits === 0) {
    return "Nothing assigned yet";
  }
  return `${formatMoney(spending)} of ${formatMoney(had)} spent`;
}

function carriedLine(
  carriedForward: Money,
  takenBack: Money,
): string | undefined {
  const parts = [
    carriedForward.minorUnits !== 0 &&
      `${formatMoney(carriedForward)} carried forward`,
    takenBack.minorUnits !== 0 && `${formatMoney(takenBack)} taken back`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/** The `?` hint for an Overspent Category, in its own numbers. */
export function overspentHint(name: string, row: CategoryRow): string {
  const short = formatMoney(
    money(-row.available.minorUnits, row.available.currency),
  );
  return `${name} had ${formatMoney(row.had)} and spent ${formatMoney(row.spending)}. Cover the ${short}, or it stays red, Month after Month.`;
}

/** A Category's row in a Month, from the records as they now stand. */
export function categoryRowIn(
  records: readonly ChangeRecord[],
  categoryId: string,
  of: Month,
  currency: Currency,
): CategoryRow {
  const zero = money(0, currency);
  return categoryRow({
    carriedForward: available(records, categoryId, previousMonth(of)) ?? zero,
    takenBack: takeBack(records, categoryId, of) ?? zero,
    assigned: assignment(records, categoryId, of) ?? zero,
    spending: spending(records, categoryId, of) ?? zero,
  });
}

export function useCategoryRow(
  categoryId: string,
  of: Month,
  currency: Currency,
): CategoryRow {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) =>
        categoryRowIn(records, categoryId, of, currency),
      [categoryId, of, currency],
    ),
  );
}
