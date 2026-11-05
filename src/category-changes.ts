/**
 * What Edit mode changes in Categories and Category Groups. Each `*WithUndo`
 * makes a change and returns what undoes it, in compensating records as in
 * `undo.ts`. The commands stay as they are, so the steps are composed here.
 */
import { useMemo } from "react";
import type { ChangeLogWriter } from "./kernel/change-log";
import { currentMonth } from "./kernel/month";
import { useChangeLogWriter } from "./kernel/use-change-log-query";
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
  setCategoryGroupSpentThisMonth,
  unhideCategory,
} from "./slices/categories/commands";
import { useToast } from "./ui/Toast";
import type { Undo } from "./undo";

function groupsNow(writer: ChangeLogWriter) {
  return categoryGroups(writer.changeLog.readAll());
}

function groupNow(writer: ChangeLogWriter, groupId: string) {
  const groups = groupsNow(writer);
  const index = groups.findIndex(({ id }) => id === groupId);
  if (index < 0) throw new RangeError(`No Category Group ${groupId}`);
  return { group: groups[index], index };
}

function categoryNow(writer: ChangeLogWriter, categoryId: string) {
  for (const group of groupsNow(writer)) {
    const index = group.categories.findIndex(({ id }) => id === categoryId);
    if (index >= 0) return { category: group.categories[index], group, index };
  }
  throw new RangeError(`No Category ${categoryId}`);
}

function hide(writer: ChangeLogWriter, categoryId: string): void {
  hideCategory(writer, categoryId, { currentMonth: currentMonth() });
}

/** Undoing deletes it. */
export function createCategoryWithUndo(
  writer: ChangeLogWriter,
  input: { groupId: string; name: string },
): Undo {
  const id = createCategory(writer, input);
  return () => deleteCategory(writer, id);
}

/** Undoing deletes it. */
export function createCategoryGroupWithUndo(
  writer: ChangeLogWriter,
  input: { name: string },
): Undo {
  const id = createCategoryGroup(writer, input);
  return () => deleteCategoryGroup(writer, id);
}

/** Undoing writes the previous name as a new record. */
export function renameCategoryWithUndo(
  writer: ChangeLogWriter,
  categoryId: string,
  input: { name: string },
): Undo {
  const { name } = categoryNow(writer, categoryId).category;
  renameCategory(writer, categoryId, input);
  return () => renameCategory(writer, categoryId, { name });
}

/** Undoing writes the previous name as a new record. */
export function renameCategoryGroupWithUndo(
  writer: ChangeLogWriter,
  groupId: string,
  input: { name: string },
): Undo {
  const { name } = groupNow(writer, groupId).group;
  renameCategoryGroup(writer, groupId, input);
  return () => renameCategoryGroup(writer, groupId, { name });
}

export function hideCategoryWithUndo(
  writer: ChangeLogWriter,
  categoryId: string,
): Undo {
  hide(writer, categoryId);
  return () => unhideCategory(writer, categoryId);
}

export function unhideCategoryWithUndo(
  writer: ChangeLogWriter,
  categoryId: string,
): Undo {
  unhideCategory(writer, categoryId);
  return () => hide(writer, categoryId);
}

/** Undoing writes a new Category, with a fresh id, in the same place. */
export function deleteCategoryWithUndo(
  writer: ChangeLogWriter,
  categoryId: string,
): Undo {
  const { category, group, index } = categoryNow(writer, categoryId);
  deleteCategory(writer, categoryId);
  return () => {
    const id = createCategory(writer, {
      groupId: group.id,
      name: category.name,
    });
    moveCategory(writer, id, { groupId: group.id, toIndex: index });
    if (category.hidden) hide(writer, id);
  };
}

/** A fresh Category Group with the same name, setting and place. */
function restoreGroup(
  writer: ChangeLogWriter,
  { name, leftOut, index }: { name: string; leftOut: boolean; index: number },
): string {
  const id = createCategoryGroup(writer, { name });
  if (leftOut) setCategoryGroupSpentThisMonth(writer, id, { leftOut });
  moveCategoryGroup(writer, id, { toIndex: index });
  return id;
}

/** Undoing writes a new Category Group, with a fresh id, in the same place. */
export function deleteCategoryGroupWithUndo(
  writer: ChangeLogWriter,
  groupId: string,
): Undo {
  const { group, index } = groupNow(writer, groupId);
  deleteCategoryGroup(writer, groupId);
  return () => {
    restoreGroup(writer, {
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
  writer: ChangeLogWriter,
  groupId: string,
  toGroupId: string,
): Undo {
  const { group, index } = groupNow(writer, groupId);
  let toIndex = groupNow(writer, toGroupId).group.categories.length;
  for (const { id } of group.categories) {
    moveCategory(writer, id, { groupId: toGroupId, toIndex });
    toIndex += 1;
  }
  deleteCategoryGroup(writer, groupId);
  return () => {
    // Checked first, so an Undo that can't finish writes nothing.
    for (const { id } of group.categories) categoryNow(writer, id);
    const restored = restoreGroup(writer, {
      name: group.name,
      leftOut: group.leftOutOfSpentThisMonth,
      index,
    });
    group.categories.forEach(({ id }, position) => {
      moveCategory(writer, id, { groupId: restored, toIndex: position });
    });
  };
}

/** Undoing puts it back where it was, as new records. */
export function moveCategoryWithUndo(
  writer: ChangeLogWriter,
  categoryId: string,
  to: { groupId: string; toIndex: number },
): Undo {
  const { group, index } = categoryNow(writer, categoryId);
  moveCategory(writer, categoryId, to);
  return () =>
    moveCategory(writer, categoryId, { groupId: group.id, toIndex: index });
}

/** Undoing puts it back where it was, as new records. */
export function moveCategoryGroupWithUndo(
  writer: ChangeLogWriter,
  groupId: string,
  to: { toIndex: number },
): Undo {
  const { index } = groupNow(writer, groupId);
  moveCategoryGroup(writer, groupId, to);
  return () => moveCategoryGroup(writer, groupId, { toIndex: index });
}

/** Undoing writes the previous setting as a new record. */
export function setSpentThisMonthWithUndo(
  writer: ChangeLogWriter,
  groupId: string,
  { leftOut }: { leftOut: boolean },
): Undo {
  const { group } = groupNow(writer, groupId);
  const previous = group.leftOutOfSpentThisMonth;
  setCategoryGroupSpentThisMonth(writer, groupId, { leftOut });
  return () =>
    setCategoryGroupSpentThisMonth(writer, groupId, { leftOut: previous });
}

/** Edit mode's changes, each with its toast and Undo. */
export function useCategoryChanges(): CategoryChanges {
  const writer = useChangeLogWriter();
  const toast = useToast();
  return useMemo(
    () => ({
      addCategory(groupId, name) {
        toast({
          text: `Added ${name}`,
          onUndo: createCategoryWithUndo(writer, { groupId, name }),
        });
      },
      addGroup(name) {
        toast({
          text: `Added ${name}`,
          onUndo: createCategoryGroupWithUndo(writer, { name }),
        });
      },
      renameCategory(categoryId, name) {
        toast({
          text: `Renamed to ${name}`,
          onUndo: renameCategoryWithUndo(writer, categoryId, { name }),
        });
      },
      renameGroup(groupId, name) {
        toast({
          text: `Renamed to ${name}`,
          onUndo: renameCategoryGroupWithUndo(writer, groupId, { name }),
        });
      },
      hide({ id, name }) {
        toast({
          text: `Hid ${name}`,
          onUndo: hideCategoryWithUndo(writer, id),
        });
      },
      unhide({ id, name }) {
        toast({
          text: `${name} is back`,
          onUndo: unhideCategoryWithUndo(writer, id),
        });
      },
      deleteCategory({ id, name }) {
        toast({
          text: `Deleted ${name}`,
          onUndo: deleteCategoryWithUndo(writer, id),
        });
      },
      deleteGroup({ id, name }) {
        toast({
          text: `Deleted ${name}`,
          onUndo: deleteCategoryGroupWithUndo(writer, id),
        });
      },
      moveThemAndDelete({ id, name }, toGroupId) {
        toast({
          text: `Deleted ${name}`,
          onUndo: moveThemAndDeleteWithUndo(writer, id, toGroupId),
        });
      },
      // Saying where it landed doubles as what a screen reader announces.
      moveCategory({ id, name }, to) {
        const onUndo = moveCategoryWithUndo(writer, id, to);
        toast({
          text: `${name}, ${categoryPlace(groupsNow(writer), id)}`,
          onUndo,
        });
      },
      moveGroup({ id, name }, toIndex) {
        const onUndo = moveCategoryGroupWithUndo(writer, id, { toIndex });
        toast({
          text: `${name}, ${groupPlace(groupsNow(writer), id)}`,
          onUndo,
        });
      },
      setLeftOut({ id, name }, leftOut) {
        toast({
          text: leftOut
            ? `${name} left out of Spent this Month`
            : `${name} counts toward Spent this Month`,
          onUndo: setSpentThisMonthWithUndo(writer, id, { leftOut }),
        });
      },
    }),
    [writer, toast],
  );
}
