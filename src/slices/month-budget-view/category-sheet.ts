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
import { type Month, monthNameAlone, previousMonth } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { assignment } from "../assignments";
import { readyToAssign } from "../budget-totals";
import { categoryGroups } from "../categories";
import { type CategoryRow, categoryRowIn } from "./category-row";
import { visibleCategoryGroups } from "./visible-categories";

export type SheetCategory = {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  row: CategoryRow;
  /** Its Assignment in the Month before. */
  lastMonth: Money;
  /** Whether no Assignment has been set this Month, not even one of zero. */
  nothingAssigned: boolean;
};

export type SheetBudget = {
  readyToAssign: Money;
  /** Every visible Category, in Budget order. */
  categories: SheetCategory[];
};

/** What the sheet reads: everything it could be asked to show or take money from. */
export function useSheetBudget(of: Month, currency: Currency): SheetBudget {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => {
        const zero = money(0, currency);
        return {
          readyToAssign: readyToAssign(records) ?? zero,
          categories: visibleCategoryGroups(categoryGroups(records)).flatMap(
            (group) =>
              group.categories.map(({ id, name }) => ({
                id,
                name,
                groupId: group.id,
                groupName: group.name,
                row: categoryRowIn(records, id, of, currency),
                lastMonth: assignment(records, id, previousMonth(of)) ?? zero,
                nothingAssigned: assignment(records, id, of) === undefined,
              })),
          ),
        };
      },
      [of, currency],
    ),
  );
}

const negated = (amount: Money) => money(-amount.minorUnits, amount.currency);

/** How much a Category is short by: zero unless it's Overspent. */
export function shortBy({ available }: CategoryRow): Money {
  return money(Math.max(0, -available.minorUnits), available.currency);
}

export type BreakdownLine = { label: string; amount: string };

/** How Available adds up: carried forward − Take-back + Assigned − Spending. */
export function breakdown(row: CategoryRow, of: Month): BreakdownLine[] {
  const { carriedForward, takenBack, assigned, spending, available } = row;
  const lastMonth = monthNameAlone(previousMonth(of));
  return [
    {
      label: `Carried forward from ${lastMonth}`,
      amount: formatMoney(carriedForward),
    },
    ...(takenBack.minorUnits !== 0
      ? [{ label: "Taken back", amount: `− ${formatMoney(takenBack)}` }]
      : []),
    {
      label: `Assigned in ${monthNameAlone(of)}`,
      amount: `+ ${formatMoney(assigned)}`,
    },
    {
      label: "Spending",
      amount:
        spending.minorUnits < 0
          ? `+ ${formatMoney(negated(spending))}`
          : `− ${formatMoney(spending)}`,
    },
    { label: "Available", amount: formatMoney(available) },
  ];
}

export type Suggestion = { label: string; amount: Money };

/** One tap's worth of Assignment to save, from Ready to Assign. */
export function suggestions(
  { row, lastMonth }: SheetCategory,
  ready: Money,
  of: Month,
): Suggestion[] {
  const { assigned, available } = row;
  const short = shortBy(row);
  const found: Suggestion[] = [];
  if (short.minorUnits > 0) {
    const covered = addMoney(assigned, short);
    found.push({
      label: `Cover it: ${formatMoney(covered)}`,
      amount: covered,
    });
  }
  const giveBack = Math.min(-ready.minorUnits, available.minorUnits);
  if (giveBack > 0) {
    const given = money(giveBack, ready.currency);
    found.push({
      label: `Give back ${formatMoney(given)}`,
      amount: subtractMoney(assigned, given),
    });
  }
  if (
    lastMonth.minorUnits > 0 &&
    lastMonth.minorUnits !== assigned.minorUnits
  ) {
    found.push({
      label: `${monthNameAlone(previousMonth(of))}: ${formatMoney(lastMonth)}`,
      amount: lastMonth,
    });
  }
  if (ready.minorUnits > 0) {
    const all = addMoney(assigned, ready);
    found.push({
      label: `All of Ready to Assign: ${formatMoney(all)}`,
      amount: all,
    });
  }
  return found;
}

/** Says what lowering a Category by `by` will do, before saving. */
function loweringNote(
  { name, row: { assigned } }: SheetCategory,
  by: Money,
  of: Month,
): string {
  const month = monthNameAlone(of);
  if (by.minorUnits <= assigned.minorUnits) {
    const after = formatMoney(subtractMoney(assigned, by));
    return `Lowers ${name}'s ${month} Assignment from ${formatMoney(assigned)} to ${after}.`;
  }
  const rest = formatMoney(subtractMoney(by, assigned));
  return assigned.minorUnits > 0
    ? `Takes ${formatMoney(assigned)} from ${name}'s ${month} Assignment and ${rest} back from what it carried forward.`
    : `Takes ${rest} back from what ${name} carried forward. Its ${month} Assignment stays ${formatMoney(assigned)}.`;
}

/** Saving `amount` as a Category's Assignment, with the money from Ready to Assign. */
export function assignPreview(
  category: SheetCategory,
  ready: Money,
  amount: Money,
  of: Month,
) {
  const { assigned, available } = category.row;
  const change = subtractMoney(amount, assigned);
  return {
    availableAfter: addMoney(available, change),
    readyToAssignAfter: subtractMoney(ready, change),
    note:
      amount.minorUnits < 0
        ? loweringNote(category, negated(change), of)
        : undefined,
  };
}

/** Moving `amount` to a Category from another one. */
export function movePreview(
  category: SheetCategory,
  source: SheetCategory,
  amount: Money,
  of: Month,
) {
  return {
    availableAfter: addMoney(category.row.available, amount),
    sourceAfter: subtractMoney(source.row.available, amount),
    note: amount.minorUnits > 0 ? loweringNote(source, amount, of) : undefined,
  };
}

export type SheetChange =
  | { kind: "unchanged" }
  | { kind: "raise" | "lower" | "move"; by: Money };

const verbs = { raise: "Assign", lower: "Take back", move: "Move" };

/** What the main button will do. `last` is the last Category in the steps. */
export function mainButton(change: SheetChange, last: boolean): string {
  if (change.kind === "unchanged") return last ? "Done" : "Next Category";
  const action = `${verbs[change.kind]} ${formatMoney(change.by)}`;
  return last ? action : `${action} and next`;
}
