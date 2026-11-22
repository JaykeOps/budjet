/**
 * What the Budget's empty state does: the first Category, or the starter set.
 * Each `*WithUndo` makes the change and returns what undoes it, in compensating
 * records as in `undo.ts`. The commands stay as they are, so the steps are
 * composed here.
 */
import { useMemo } from "react";
import type { DeviceChangeLog } from "./kernel/change-log";
import { useDeviceChangeLog } from "./kernel/use-change-log-query";
import { categoryUsed } from "./slices/budget-totals";
import { categoryGroups } from "./slices/categories";
import {
  addStarterSet,
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
} from "./slices/categories/commands";
import type { FirstCategoryChanges } from "./slices/month-budget-view";
import { useToast } from "./ui/Toast";
import type { Undo } from "./undo";

/** Takes away Category Groups and everything in them, or refuses and writes nothing. */
function undoAdding(log: DeviceChangeLog, groupIds: readonly string[]): Undo {
  return () => {
    const records = log.readAll();
    const groups = categoryGroups(records).filter(({ id }) =>
      groupIds.includes(id),
    );
    const categories = groups.flatMap((group) => group.categories);
    const used = categories.find(({ id }) => categoryUsed(records, id));
    if (used) {
      throw new Error(`${used.name} is in use now, so this can't be undone.`);
    }
    for (const { id } of categories) deleteCategory(log, id);
    for (const { id } of groups) deleteCategoryGroup(log, id);
  };
}

/** Both names are checked first, so a blank one leaves no empty Category Group behind. */
export function addFirstCategoryWithUndo(
  log: DeviceChangeLog,
  { name, groupName }: { name: string; groupName: string },
): Undo {
  if (!name.trim() || !groupName.trim()) {
    throw new Error("A name can't be blank");
  }
  const groupId = createCategoryGroup(log, { name: groupName });
  createCategory(log, { groupId, name });
  return undoAdding(log, [groupId]);
}

export function addStarterSetWithUndo(log: DeviceChangeLog): Undo {
  addStarterSet(log);
  return undoAdding(
    log,
    categoryGroups(log.readAll()).map(({ id }) => id),
  );
}

export function useFirstCategoryChanges(): FirstCategoryChanges {
  const log = useDeviceChangeLog();
  const toast = useToast();
  return useMemo(
    () => ({
      addCategory(input) {
        toast({
          text: `Added ${input.name.trim()}`,
          onUndo: addFirstCategoryWithUndo(log, input),
        });
      },
      addStarterSet() {
        toast({
          text: "Added the starter set",
          onUndo: addStarterSetWithUndo(log),
        });
      },
    }),
    [log, toast],
  );
}
