import { useMemo } from "react";
import { type CategoryGroup, useCategoryGroups } from "../categories";

/**
 * The Category Groups with only the Categories the Month Budget view shows:
 * hidden Categories drop out of its rows, subtotals, Overspent list and Move
 * money form.
 */
export function visibleCategoryGroups(
  groups: readonly CategoryGroup[],
): CategoryGroup[] {
  return groups.map((group) => ({
    ...group,
    categories: group.categories.filter(({ hidden }) => !hidden),
  }));
}

export function useVisibleCategoryGroups(): CategoryGroup[] {
  const groups = useCategoryGroups();
  return useMemo(() => visibleCategoryGroups(groups), [groups]);
}
