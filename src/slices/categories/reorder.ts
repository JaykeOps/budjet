/** Where things can go when reordering. Pure, so nothing here writes. */
import type { CategoryGroup } from "./queries";

/** Where a Category can be: which Category Group, and its place among the others. */
export type CategoryPlace = { groupId: string; toIndex: number };

/** Where a Category is now. */
export function categoryAt(
  groups: readonly CategoryGroup[],
  categoryId: string,
): (CategoryPlace & { group: CategoryGroup }) | undefined {
  for (const group of groups) {
    const toIndex = group.categories.findIndex(({ id }) => id === categoryId);
    if (toIndex >= 0) return { group, groupId: group.id, toIndex };
  }
  return undefined;
}

/**
 * Where one step up or down takes a Category, crossing into the next Category
 * Group at the ends. Hidden Categories count, since they show in place.
 */
export function categoryStep(
  groups: readonly CategoryGroup[],
  categoryId: string,
  by: -1 | 1,
): CategoryPlace | undefined {
  const here = categoryAt(groups, categoryId);
  if (!here) return undefined;
  const toIndex = here.toIndex + by;
  if (toIndex >= 0 && toIndex < here.group.categories.length) {
    return { groupId: here.groupId, toIndex };
  }
  const next = groups[groups.indexOf(here.group) + by];
  if (!next) return undefined;
  return {
    groupId: next.id,
    toIndex: by < 0 ? next.categories.length : 0,
  };
}

/** Where one step up or down takes a Category Group. */
export function groupStep(
  groups: readonly CategoryGroup[],
  groupId: string,
  by: -1 | 1,
): number | undefined {
  const toIndex = groups.findIndex(({ id }) => id === groupId) + by;
  return toIndex >= 0 && toIndex < groups.length ? toIndex : undefined;
}

/** E.g. "2 of 6 in Everyday". */
export function categoryPlace(
  groups: readonly CategoryGroup[],
  categoryId: string,
): string {
  const here = categoryAt(groups, categoryId);
  if (!here) return "";
  const { group, toIndex } = here;
  return `${toIndex + 1} of ${group.categories.length} in ${group.name}`;
}

/** E.g. "2 of 3 Groups". */
export function groupPlace(
  groups: readonly CategoryGroup[],
  groupId: string,
): string {
  const index = groups.findIndex(({ id }) => id === groupId);
  return `${index + 1} of ${groups.length} Groups`;
}

/** The list with a Category somewhere else, for showing it before it's placed. */
export function withCategoryAt(
  groups: readonly CategoryGroup[],
  categoryId: string,
  { groupId, toIndex }: CategoryPlace,
): CategoryGroup[] {
  const moved = categoryAt(groups, categoryId)?.group.categories.find(
    ({ id }) => id === categoryId,
  );
  return groups.map((group) => {
    const others = group.categories.filter(({ id }) => id !== categoryId);
    return {
      ...group,
      categories:
        moved && group.id === groupId
          ? others.toSpliced(toIndex, 0, moved)
          : others,
    };
  });
}

/** The list with a Category Group somewhere else. */
export function withGroupAt(
  groups: readonly CategoryGroup[],
  groupId: string,
  toIndex: number,
): CategoryGroup[] {
  const moved = groups.find(({ id }) => id === groupId);
  const others = groups.filter(({ id }) => id !== groupId);
  return moved ? others.toSpliced(toIndex, 0, moved) : others;
}
