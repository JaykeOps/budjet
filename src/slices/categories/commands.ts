import type { DeviceChangeLog } from "../../kernel/change-log";
import { formatMoney } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { assignedAfter, available, categoryUsed } from "../budget-totals";
import { categoryGroups } from "./queries";
import type { CategoriesRecord } from "./records";

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
): string {
  const id = crypto.randomUUID();
  const groups = categoryGroups(log.readAll());
  write(log, id, "CategoryGroupCreated", {
    version: 1,
    name: validName(name),
    position: groups.length,
  });
  return id;
}

/** Adds a Category at the end of its Category Group and returns its id. */
export function createCategory(
  log: DeviceChangeLog,
  { groupId, name }: { groupId: string; name: string },
): string {
  const id = crypto.randomUUID();
  const group = findGroup(log, groupId);
  write(log, id, "CategoryCreated", {
    version: 1,
    groupId,
    name: validName(name),
    position: group.categories.length,
  });
  return id;
}

export function renameCategoryGroup(
  log: DeviceChangeLog,
  groupId: string,
  { name }: { name: string },
): void {
  findGroup(log, groupId);
  write(log, groupId, "CategoryGroupRenamed", {
    version: 1,
    name: validName(name),
  });
}

export function renameCategory(
  log: DeviceChangeLog,
  categoryId: string,
  { name }: { name: string },
): void {
  findCategory(log, categoryId);
  write(log, categoryId, "CategoryRenamed", {
    version: 1,
    name: validName(name),
  });
}

/** Leaves a Category Group out of Spent this Month, or counts it again. */
export function setCategoryGroupSpentThisMonth(
  log: DeviceChangeLog,
  groupId: string,
  { leftOut }: { leftOut: boolean },
): void {
  findGroup(log, groupId);
  write(log, groupId, "CategoryGroupSpentThisMonthSet", {
    version: 1,
    leftOut,
  });
}

/** Puts a Category Group at `toIndex` among the Category Groups. */
export function moveCategoryGroup(
  log: DeviceChangeLog,
  groupId: string,
  { toIndex }: { toIndex: number },
): void {
  findGroup(log, groupId);
  const others = categoryGroups(log.readAll())
    .map(({ id }) => id)
    .filter((id) => id !== groupId);
  for (const [position, id] of placeAt(others, groupId, toIndex)) {
    write(log, id, "CategoryGroupPlaced", { version: 1, position });
  }
}

/**
 * Puts a Category at `toIndex` among the Categories of `groupId`, which may be
 * its own Category Group (a reorder) or another one (a move).
 */
export function moveCategory(
  log: DeviceChangeLog,
  categoryId: string,
  { groupId, toIndex }: { groupId: string; toIndex: number },
): void {
  findCategory(log, categoryId);
  const others = findGroup(log, groupId)
    .categories.map(({ id }) => id)
    .filter((id) => id !== categoryId);
  for (const [position, id] of placeAt(others, categoryId, toIndex)) {
    write(log, id, "CategoryPlaced", { version: 1, groupId, position });
  }
}

/**
 * Hides a Category: it leaves the Month Budget view and the Category pickers,
 * and its history stays. Refused while it has money Available (or is
 * Overspent) in the current Month, or has Assignments in later Months, so
 * hiding never makes money vanish.
 */
export function hideCategory(
  log: DeviceChangeLog,
  categoryId: string,
  { currentMonth }: { currentMonth: Month },
): void {
  const { category } = findCategory(log, categoryId);
  const records = log.readAll();
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
  write(log, categoryId, "CategoryHidden", { version: 1 });
}

/** Brings a hidden Category back. */
export function unhideCategory(log: DeviceChangeLog, categoryId: string): void {
  findCategory(log, categoryId);
  write(log, categoryId, "CategoryUnhidden", { version: 1 });
}

/**
 * Hides a Category again whatever it holds, for an Undo of unhiding it: it was
 * hidden like that a moment ago, and the Budget flags one holding money.
 */
export function restoreHidden(log: DeviceChangeLog, categoryId: string): void {
  findCategory(log, categoryId);
  write(log, categoryId, "CategoryHidden", { version: 1 });
}

/**
 * Refuses to delete a used Category. The UI offers to hide it instead, so it
 * can tell this refusal from the others.
 */
export class CategoryInUseError extends Error {
  constructor(
    readonly categoryId: string,
    name: string,
  ) {
    super(
      `${name} has Transactions or Assignments, so it can't be deleted. You can hide it instead.`,
    );
    this.name = "CategoryInUseError";
  }
}

/** Deletes a Category that was never used. A used one can only be hidden. */
export function deleteCategory(log: DeviceChangeLog, categoryId: string): void {
  const { category } = findCategory(log, categoryId);
  if (categoryUsed(log.readAll(), categoryId)) {
    throw new CategoryInUseError(categoryId, category.name);
  }
  write(log, categoryId, "CategoryDeleted", { version: 1 });
}

/** Deletes a Category Group with no Categories in it, hidden ones included. */
export function deleteCategoryGroup(
  log: DeviceChangeLog,
  groupId: string,
): void {
  const group = findGroup(log, groupId);
  if (group.categories.length > 0) {
    throw new Error(
      `${group.name} still has Categories. Move or delete them first.`,
    );
  }
  write(log, groupId, "CategoryGroupDeleted", { version: 1 });
}

/**
 * Every position in the new order. Writing them all makes the most recent
 * reorder win as a whole when two devices reorder the same things.
 */
function placeAt(
  others: string[],
  movedId: string,
  toIndex: number,
): [number, string][] {
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex > others.length) {
    throw new RangeError(`There is no place ${toIndex} to move to`);
  }
  return others
    .toSpliced(toIndex, 0, movedId)
    .map((id, position) => [position, id]);
}

function findCategory(log: DeviceChangeLog, categoryId: string) {
  for (const group of categoryGroups(log.readAll())) {
    const category = group.categories.find(({ id }) => id === categoryId);
    if (category) return { group, category };
  }
  throw new Error("There is no such Category");
}

function findGroup(log: DeviceChangeLog, groupId: string) {
  const group = categoryGroups(log.readAll()).find(({ id }) => id === groupId);
  if (!group) throw new Error("There is no such Category Group");
  return group;
}

function validName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name can't be blank");
  return trimmed;
}

function write<Record extends CategoriesRecord>(
  log: DeviceChangeLog,
  subjectId: string,
  type: Record["type"],
  payload: Record["payload"],
): void {
  log.write(subjectId, type, payload);
}
