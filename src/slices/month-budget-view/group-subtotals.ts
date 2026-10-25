import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import { addMoney, type Currency, type Money, money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { assignment } from "../assignments";
import { available, spending } from "../budget-totals";
import { categoryGroups } from "../categories";
import { visibleCategoryGroups } from "./visible-categories";

export type GroupSubtotals = {
  assigned: Money;
  spent: Money;
  available: Money;
};

/**
 * Each Category Group's Assignment, spending and Available in a Month, summed
 * over its visible Categories and keyed by group id.
 */
function groupSubtotals(
  records: readonly ChangeRecord[],
  of: Month,
  currency: Currency,
): Record<string, GroupSubtotals> {
  const zero = money(0, currency);
  const result: Record<string, GroupSubtotals> = {};
  for (const group of visibleCategoryGroups(categoryGroups(records))) {
    const subtotals = { assigned: zero, spent: zero, available: zero };
    for (const { id } of group.categories) {
      subtotals.assigned = addMoney(
        subtotals.assigned,
        assignment(records, id, of) ?? zero,
      );
      subtotals.spent = addMoney(
        subtotals.spent,
        spending(records, id, of) ?? zero,
      );
      subtotals.available = addMoney(
        subtotals.available,
        available(records, id, of) ?? zero,
      );
    }
    result[group.id] = subtotals;
  }
  return result;
}

export function useGroupSubtotals(
  of: Month,
  currency: Currency,
): Record<string, GroupSubtotals> {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) =>
        groupSubtotals(records, of, currency),
      [of, currency],
    ),
  );
}
