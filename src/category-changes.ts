/**
 * What Edit mode changes in Categories and Category Groups. Each `*WithUndo`
 * makes a change and returns what undoes it, in compensating records as in
 * `undo.ts`. The commands stay as they are, so the steps are composed here.
 */
import { useMemo } from "react";
import type { DeviceChangeLog } from "./kernel/change-log";
import type { CategoryGroupId, CategoryId } from "./kernel/id";
import { formatMoney, money, subtractMoney } from "./kernel/money";
import { currentMonth, type Month } from "./kernel/month";
import { useDeviceChangeLog } from "./kernel/use-change-log-query";
import { assignment } from "./slices/assignments";
import { moveMoney, setAssignment } from "./slices/assignments/commands";
import { assignmentsAfter, available } from "./slices/budget-totals";
import {
  type CategoryChanges,
  categoryGroups,
  categoryPlace,
  groupPlace,
} from "./slices/categories";
import {
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  hideCategory,
  moveCategory,
  moveCategoryGroup,
  renameCategory,
  renameCategoryGroup,
  restoreHidden,
  setCategoryGroupSpentThisMonth,
  unhideCategory,
} from "./slices/categories/commands";
import { useToast } from "./ui/Toast";
import { type Place, rememberMoney, type Undo } from "./undo";

function groupsNow(log: DeviceChangeLog) {
  return categoryGroups(log.readAll());
}

function groupNow(log: DeviceChangeLog, groupId: CategoryGroupId) {
  const groups = groupsNow(log);
  const index = groups.findIndex(({ id }) => id === groupId);
  if (index < 0) throw new RangeError(`No Category Group ${groupId}`);
  return { group: groups[index], index };
}

function categoryNow(log: DeviceChangeLog, categoryId: CategoryId) {
  for (const group of groupsNow(log)) {
    const index = group.categories.findIndex(({ id }) => id === categoryId);
    if (index >= 0) return { category: group.categories[index], group, index };
  }
  throw new RangeError(`No Category ${categoryId}`);
}

function hide(log: DeviceChangeLog, categoryId: CategoryId): void {
  hideCategory(log, categoryId, { currentMonth: currentMonth() });
}

/** Undoing deletes it. */
export function createCategoryWithUndo(
  log: DeviceChangeLog,
  input: { groupId: CategoryGroupId; name: string },
): Undo {
  const id = createCategory(log, input);
  return () => deleteCategory(log, id);
}

/** Undoing deletes it. */
export function createCategoryGroupWithUndo(
  log: DeviceChangeLog,
  input: { name: string },
): Undo {
  const id = createCategoryGroup(log, input);
  return () => deleteCategoryGroup(log, id);
}

/** Undoing writes the previous name as a new record. */
export function renameCategoryWithUndo(
  log: DeviceChangeLog,
  categoryId: CategoryId,
  input: { name: string },
): Undo {
  const { name } = categoryNow(log, categoryId).category;
  renameCategory(log, categoryId, input);
  return () => renameCategory(log, categoryId, { name });
}

/** Undoing writes the previous name as a new record. */
export function renameCategoryGroupWithUndo(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
  input: { name: string },
): Undo {
  const { name } = groupNow(log, groupId).group;
  renameCategoryGroup(log, groupId, input);
  return () => renameCategoryGroup(log, groupId, { name });
}

/**
 * Brings a Category's Available in a Month to zero, with `other` Category or,
 * without one, Ready to Assign taking the money or covering what's Overspent.
 * Take-back applies through the commands.
 */
function moveOut(
  log: DeviceChangeLog,
  categoryId: CategoryId,
  { month, other }: { month: Month; other?: CategoryId },
): void {
  const records = log.readAll();
  const left = available(records, categoryId, month);
  if (!left?.minorUnits) return;
  if (other) {
    const amount = money(Math.abs(left.minorUnits), left.currency);
    moveMoney(log, {
      fromCategoryId: left.minorUnits > 0 ? categoryId : other,
      toCategoryId: left.minorUnits > 0 ? other : categoryId,
      month,
      amount,
    });
    return;
  }
  const assigned =
    assignment(records, categoryId, month) ?? money(0, left.currency);
  setAssignment(log, {
    categoryId,
    month,
    amount: subtractMoney(assigned, left),
  });
}

function moneyPlaces(
  categoryId: CategoryId,
  { month, other }: { month: Month; other?: CategoryId },
): Place[] {
  return other
    ? [
        { categoryId, month },
        { categoryId: other, month },
      ]
    : [{ categoryId, month }];
}

/** Undoing writes back the Assignments and Take-backs it changed. */
export function moveOutWithUndo(
  log: DeviceChangeLog,
  categoryId: CategoryId,
  where: { month: Month; other?: CategoryId },
): Undo {
  const restore = rememberMoney(log, moneyPlaces(categoryId, where));
  moveOut(log, categoryId, where);
  return restore;
}

/**
 * Hides a Category in one step: its Available in `month` goes to `other` or
 * Ready to Assign, or is covered from them, and its Assignments in later Months
 * go to zero, which returns them to Ready to Assign. Later Take-backs stay,
 * because they aren't Assignments: a Month with one reads Overspent, and the
 * Budget flags it. Undoing writes the reverse of each step.
 */
export function hideCategoryWithUndo(
  log: DeviceChangeLog,
  categoryId: CategoryId,
  { month = currentMonth(), other }: { month?: Month; other?: CategoryId } = {},
): Undo {
  categoryNow(log, categoryId);
  const later = assignmentsAfter(log.readAll(), categoryId, month);
  const restore = rememberMoney(log, [
    ...moneyPlaces(categoryId, { month, other }),
    ...later.map((place) => ({ categoryId, month: place.month })),
  ]);
  moveOut(log, categoryId, { month, other });
  for (const { month: laterMonth, amount } of later) {
    setAssignment(log, {
      categoryId,
      month: laterMonth,
      amount: money(0, amount.currency),
    });
  }
  hideCategory(log, categoryId, { currentMonth: month });
  return () => {
    // First, so an Undo ruled out by another device's delete writes nothing.
    unhideCategory(log, categoryId);
    restore();
  };
}

export function unhideCategoryWithUndo(
  log: DeviceChangeLog,
  categoryId: CategoryId,
): Undo {
  unhideCategory(log, categoryId);
  return () => restoreHidden(log, categoryId);
}

/** Undoing writes a new Category, with a fresh id, in the same place. */
export function deleteCategoryWithUndo(
  log: DeviceChangeLog,
  categoryId: CategoryId,
): Undo {
  const { category, group, index } = categoryNow(log, categoryId);
  deleteCategory(log, categoryId);
  return () => {
    const id = createCategory(log, {
      groupId: group.id,
      name: category.name,
    });
    moveCategory(log, id, { groupId: group.id, toIndex: index });
    if (category.hidden) hide(log, id);
  };
}

/** A fresh Category Group with the same name, setting and place. */
function restoreGroup(
  log: DeviceChangeLog,
  { name, leftOut, index }: { name: string; leftOut: boolean; index: number },
): CategoryGroupId {
  const id = createCategoryGroup(log, { name });
  if (leftOut) setCategoryGroupSpentThisMonth(log, id, { leftOut });
  moveCategoryGroup(log, id, { toIndex: index });
  return id;
}

/** Undoing writes a new Category Group, with a fresh id, in the same place. */
export function deleteCategoryGroupWithUndo(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
): Undo {
  const { group, index } = groupNow(log, groupId);
  deleteCategoryGroup(log, groupId);
  return () => {
    restoreGroup(log, {
      name: group.name,
      leftOut: group.leftOutOfSpentThisMonth,
      index,
    });
  };
}

/**
 * Moves a Category Group's Categories, hidden ones too, after those of another
 * one, then deletes it. Undoing writes a new Category Group, with a fresh id,
 * in the same place, and moves them back in their order.
 */
export function moveThemAndDeleteWithUndo(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
  toGroupId: CategoryGroupId,
): Undo {
  const { group, index } = groupNow(log, groupId);
  let toIndex = groupNow(log, toGroupId).group.categories.length;
  for (const { id } of group.categories) {
    moveCategory(log, id, { groupId: toGroupId, toIndex });
    toIndex += 1;
  }
  deleteCategoryGroup(log, groupId);
  return () => {
    // Checked first, so an Undo that can't finish writes nothing.
    for (const { id } of group.categories) categoryNow(log, id);
    const restored = restoreGroup(log, {
      name: group.name,
      leftOut: group.leftOutOfSpentThisMonth,
      index,
    });
    group.categories.forEach(({ id }, position) => {
      moveCategory(log, id, { groupId: restored, toIndex: position });
    });
  };
}

/** Undoing puts it back where it was, as new records. */
export function moveCategoryWithUndo(
  log: DeviceChangeLog,
  categoryId: CategoryId,
  to: { groupId: CategoryGroupId; toIndex: number },
): Undo {
  const { group, index } = categoryNow(log, categoryId);
  moveCategory(log, categoryId, to);
  return () =>
    moveCategory(log, categoryId, { groupId: group.id, toIndex: index });
}

/** Undoing puts it back where it was, as new records. */
export function moveCategoryGroupWithUndo(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
  to: { toIndex: number },
): Undo {
  const { index } = groupNow(log, groupId);
  moveCategoryGroup(log, groupId, to);
  return () => moveCategoryGroup(log, groupId, { toIndex: index });
}

/** Undoing writes the previous setting as a new record. */
export function setSpentThisMonthWithUndo(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
  { leftOut }: { leftOut: boolean },
): Undo {
  const { group } = groupNow(log, groupId);
  const previous = group.leftOutOfSpentThisMonth;
  setCategoryGroupSpentThisMonth(log, groupId, { leftOut });
  return () =>
    setCategoryGroupSpentThisMonth(log, groupId, { leftOut: previous });
}

/** Edit mode's changes, each with its toast and Undo. */
export function useCategoryChanges(): CategoryChanges {
  const log = useDeviceChangeLog();
  const toast = useToast();
  return useMemo(
    () => ({
      addCategory(groupId, name) {
        toast({
          text: `Added ${name}`,
          onUndo: createCategoryWithUndo(log, { groupId, name }),
        });
      },
      addGroup(name) {
        toast({
          text: `Added ${name}`,
          onUndo: createCategoryGroupWithUndo(log, { name }),
        });
      },
      renameCategory(categoryId, name) {
        toast({
          text: `Renamed to ${name}`,
          onUndo: renameCategoryWithUndo(log, categoryId, { name }),
        });
      },
      renameGroup(groupId, name) {
        toast({
          text: `Renamed to ${name}`,
          onUndo: renameCategoryGroupWithUndo(log, groupId, { name }),
        });
      },
      hide({ id, name }, other) {
        toast({
          text: `Hid ${name}`,
          onUndo: hideCategoryWithUndo(log, id, { other }),
        });
      },
      moveOut({ id, name }, month, other) {
        const left = available(log.readAll(), id, month);
        toast({
          text:
            left && left.minorUnits > 0
              ? `Moved ${formatMoney(left)} out of ${name}`
              : `Covered ${name}`,
          onUndo: moveOutWithUndo(log, id, { month, other }),
        });
      },
      unhide({ id, name }) {
        toast({
          text: `${name} is back`,
          onUndo: unhideCategoryWithUndo(log, id),
        });
      },
      deleteCategory({ id, name }) {
        toast({
          text: `Deleted ${name}`,
          onUndo: deleteCategoryWithUndo(log, id),
        });
      },
      deleteGroup({ id, name }) {
        toast({
          text: `Deleted ${name}`,
          onUndo: deleteCategoryGroupWithUndo(log, id),
        });
      },
      moveThemAndDelete({ id, name }, toGroupId) {
        toast({
          text: `Deleted ${name}`,
          onUndo: moveThemAndDeleteWithUndo(log, id, toGroupId),
        });
      },
      // Saying where it landed doubles as what a screen reader announces.
      moveCategory({ id, name }, to) {
        const onUndo = moveCategoryWithUndo(log, id, to);
        toast({
          text: `${name}, ${categoryPlace(groupsNow(log), id)}`,
          onUndo,
        });
      },
      moveGroup({ id, name }, toIndex) {
        const onUndo = moveCategoryGroupWithUndo(log, id, { toIndex });
        toast({
          text: `${name}, ${groupPlace(groupsNow(log), id)}`,
          onUndo,
        });
      },
      setLeftOut({ id, name }, leftOut) {
        toast({
          text: leftOut
            ? `${name} left out of Spent this Month`
            : `${name} counts toward Spent this Month`,
          onUndo: setSpentThisMonthWithUndo(log, id, { leftOut }),
        });
      },
    }),
    [log, toast],
  );
}
