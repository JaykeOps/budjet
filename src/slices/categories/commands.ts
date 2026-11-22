import type { ChangeRecord, DeviceChangeLog } from "../../kernel/change-log";
import { type CategoryGroupId, type CategoryId, newId } from "../../kernel/id";
import { formatMoney } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { assignedAfter, available, categoryUsed } from "../budget-totals";
import { categoryGroups } from "./queries";
import type {
  CategoriesRecord,
  CategoryGroupPlaced,
  CategoryPlaced,
} from "./records";

export const starterSet = [
  ["Bills", ["Rent", "Power", "Phone", "Internet"], { leftOut: false }],
  ["Everyday", ["Groceries", "Transport", "Dining Out"], { leftOut: false }],
  ["Savings", ["Emergency Fund"], { leftOut: true }],
] as const;

/** Gives a new Budget its starter Category Groups and Categories. */
export function addStarterSet(log: DeviceChangeLog): void {
  if (categoryGroups(log.readAll()).length > 0) {
    throw new Error("The Budget already has Category Groups");
  }
  for (const [groupName, categoryNames, { leftOut }] of starterSet) {
    const groupId = createCategoryGroup(log, { name: groupName });
    if (leftOut) setCategoryGroupSpentThisMonth(log, groupId, { leftOut });
    for (const name of categoryNames) {
      createCategory(log, { groupId, name });
    }
  }
}

/** Adds a Category Group after the others and returns its id. */
export function createCategoryGroup(
  log: DeviceChangeLog,
  { name }: { name: string },
): CategoryGroupId {
  const id = newId<CategoryGroupId>();
  write(log, id, "CategoryGroupCreated")
    .ensure((records) => categoryGroups(records).length)
    .commit((position) => ({ version: 1, name: validName(name), position }));
  return id;
}

/** Adds a Category at the end of its Category Group and returns its id. */
export function createCategory(
  log: DeviceChangeLog,
  { groupId, name }: { groupId: CategoryGroupId; name: string },
): CategoryId {
  const id = newId<CategoryId>();
  write(log, id, "CategoryCreated")
    .ensure((records) => findGroup(records, groupId))
    .commit((group) => ({
      version: 1,
      groupId,
      name: validName(name),
      position: group.categories.length,
    }));
  return id;
}

export function renameCategoryGroup(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
  { name }: { name: string },
): void {
  write(log, groupId, "CategoryGroupRenamed")
    .ensure((records) => findGroup(records, groupId))
    .commit(() => ({ version: 1, name: validName(name) }));
}

export function renameCategory(
  log: DeviceChangeLog,
  categoryId: CategoryId,
  { name }: { name: string },
): void {
  write(log, categoryId, "CategoryRenamed")
    .ensure((records) => findCategory(records, categoryId))
    .commit(() => ({ version: 1, name: validName(name) }));
}

/** Leaves a Category Group out of Spent this Month, or counts it again. */
export function setCategoryGroupSpentThisMonth(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
  { leftOut }: { leftOut: boolean },
): void {
  write(log, groupId, "CategoryGroupSpentThisMonthSet")
    .ensure((records) => findGroup(records, groupId))
    .commit(() => ({ version: 1, leftOut }));
}

/** Puts a Category Group at `toIndex` among the Category Groups. */
export function moveCategoryGroup(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
  { toIndex }: { toIndex: number },
): void {
  log
    .writeMany<CategoryGroupPlaced>()
    .ensure((records) => {
      findGroup(records, groupId);
      const others = categoryGroups(records)
        .map(({ id }) => id)
        .filter((id) => id !== groupId);
      return placeAt(others, groupId, toIndex);
    })
    .commit((places) =>
      places.map(([position, id]) => ({
        subjectId: id,
        type: "CategoryGroupPlaced",
        payload: { version: 1, position },
      })),
    );
}

/**
 * Puts a Category at `toIndex` among the Categories of `groupId`, which may be
 * its own Category Group (a reorder) or another one (a move).
 */
export function moveCategory(
  log: DeviceChangeLog,
  categoryId: CategoryId,
  { groupId, toIndex }: { groupId: CategoryGroupId; toIndex: number },
): void {
  log
    .writeMany<CategoryPlaced>()
    .ensure((records) => {
      findCategory(records, categoryId);
      const others = findGroup(records, groupId)
        .categories.map(({ id }) => id)
        .filter((id) => id !== categoryId);
      return placeAt(others, categoryId, toIndex);
    })
    .commit((places) =>
      places.map(([position, id]) => ({
        subjectId: id,
        type: "CategoryPlaced",
        payload: { version: 1, groupId, position },
      })),
    );
}

/**
 * Hides a Category: it leaves the Month Budget view and the Category pickers,
 * and its history stays. Refused while it has money Available (or is
 * Overspent) in the current Month, or has Assignments in later Months, so
 * hiding never makes money vanish.
 */
export function hideCategory(
  log: DeviceChangeLog,
  categoryId: CategoryId,
  { currentMonth }: { currentMonth: Month },
): void {
  write(log, categoryId, "CategoryHidden")
    .ensure((records) => {
      const { category } = findCategory(records, categoryId);
      const left = available(records, categoryId, currentMonth);
      if (left && left.minorUnits !== 0) {
        throw new Error(
          `${category.name} still has ${formatMoney(left)} Available. Move it to another Category first.`,
        );
      }
      if (assignedAfter(records, categoryId, currentMonth)) {
        throw new Error(
          `${category.name} has Assignments in later Months. Set them to zero first.`,
        );
      }
    })
    .commit(() => ({ version: 1 }));
}

/** Brings a hidden Category back. */
export function unhideCategory(
  log: DeviceChangeLog,
  categoryId: CategoryId,
): void {
  write(log, categoryId, "CategoryUnhidden")
    .ensure((records) => findCategory(records, categoryId))
    .commit(() => ({ version: 1 }));
}

/**
 * Hides a Category again whatever it holds, for an Undo of unhiding it: it was
 * hidden like that a moment ago, and the Budget flags one holding money.
 */
export function restoreHidden(
  log: DeviceChangeLog,
  categoryId: CategoryId,
): void {
  write(log, categoryId, "CategoryHidden")
    .ensure((records) => findCategory(records, categoryId))
    .commit(() => ({ version: 1 }));
}

/**
 * Refuses to delete a used Category. The UI offers to hide it instead, so it
 * can tell this refusal from the others.
 */
export class CategoryInUseError extends Error {
  constructor(
    readonly categoryId: CategoryId,
    name: string,
  ) {
    super(
      `${name} has Transactions or Assignments, so it can't be deleted. You can hide it instead.`,
    );
    this.name = "CategoryInUseError";
  }
}

/** Deletes a Category that was never used. A used one can only be hidden. */
export function deleteCategory(
  log: DeviceChangeLog,
  categoryId: CategoryId,
): void {
  write(log, categoryId, "CategoryDeleted")
    .ensure((records) => {
      const { category } = findCategory(records, categoryId);
      if (categoryUsed(records, categoryId)) {
        throw new CategoryInUseError(categoryId, category.name);
      }
    })
    .commit(() => ({ version: 1 }));
}

/** Deletes a Category Group with no Categories in it, hidden ones included. */
export function deleteCategoryGroup(
  log: DeviceChangeLog,
  groupId: CategoryGroupId,
): void {
  write(log, groupId, "CategoryGroupDeleted")
    .ensure((records) => {
      const group = findGroup(records, groupId);
      if (group.categories.length > 0) {
        throw new Error(
          `${group.name} still has Categories. Move or delete them first.`,
        );
      }
    })
    .commit(() => ({ version: 1 }));
}

/**
 * Every position in the new order. Writing them all makes the most recent
 * reorder win as a whole when two devices reorder the same things.
 */
function placeAt<Id extends string>(
  others: Id[],
  movedId: Id,
  toIndex: number,
): [number, Id][] {
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex > others.length) {
    throw new RangeError(`There is no place ${toIndex} to move to`);
  }
  return others
    .toSpliced(toIndex, 0, movedId)
    .map((id, position) => [position, id]);
}

function findCategory(
  records: readonly ChangeRecord[],
  categoryId: CategoryId,
) {
  for (const group of categoryGroups(records)) {
    const category = group.categories.find(({ id }) => id === categoryId);
    if (category) return { group, category };
  }
  throw new Error("There is no such Category");
}

function findGroup(records: readonly ChangeRecord[], groupId: CategoryGroupId) {
  const group = categoryGroups(records).find(({ id }) => id === groupId);
  if (!group) throw new Error("There is no such Category Group");
  return group;
}

function validName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name can't be blank");
  return trimmed;
}

/** Starts a write of one of the records Categories publishes, typed by its `type`. */
function write<Type extends CategoriesRecord["type"]>(
  log: DeviceChangeLog,
  subjectId: string,
  type: Type,
) {
  return log.write<Type, Extract<CategoriesRecord, { type: Type }>["payload"]>(
    subjectId,
    type,
  );
}
