import type { ChangeLogWriter } from "../../kernel/change-log";
import { formatMoney } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { assignedAfter, available, categoryUsed } from "../budget-totals";
import { categoryGroups } from "./queries";
import type { CategoriesRecord } from "./records";

const starterSet = [
  ["Bills", ["Rent", "Power", "Phone", "Internet"]],
  ["Everyday", ["Groceries", "Transport", "Dining Out"]],
  ["Savings", ["Emergency Fund"]],
] as const;

/** Gives a new Budget its starter Category Groups and Categories. */
export function addStarterSet(writer: ChangeLogWriter): void {
  if (categoryGroups(writer.changeLog.readAll()).length > 0) {
    throw new Error("The Budget already has Category Groups");
  }
  for (const [groupName, categoryNames] of starterSet) {
    const groupId = createCategoryGroup(writer, { name: groupName });
    for (const name of categoryNames) {
      createCategory(writer, { groupId, name });
    }
  }
}

/** Adds a Category Group after the others and returns its id. */
export function createCategoryGroup(
  writer: ChangeLogWriter,
  { name }: { name: string },
): string {
  const id = crypto.randomUUID();
  const groups = categoryGroups(writer.changeLog.readAll());
  write(writer, id, "CategoryGroupCreated", {
    version: 1,
    name: validName(name),
    position: groups.length,
  });
  return id;
}

/** Adds a Category at the end of its Category Group and returns its id. */
export function createCategory(
  writer: ChangeLogWriter,
  { groupId, name }: { groupId: string; name: string },
): string {
  const id = crypto.randomUUID();
  const group = findGroup(writer, groupId);
  write(writer, id, "CategoryCreated", {
    version: 1,
    groupId,
    name: validName(name),
    position: group.categories.length,
  });
  return id;
}

export function renameCategoryGroup(
  writer: ChangeLogWriter,
  groupId: string,
  { name }: { name: string },
): void {
  findGroup(writer, groupId);
  write(writer, groupId, "CategoryGroupRenamed", {
    version: 1,
    name: validName(name),
  });
}

export function renameCategory(
  writer: ChangeLogWriter,
  categoryId: string,
  { name }: { name: string },
): void {
  findCategory(writer, categoryId);
  write(writer, categoryId, "CategoryRenamed", {
    version: 1,
    name: validName(name),
  });
}

/** Puts a Category Group at `toIndex` among the Category Groups. */
export function moveCategoryGroup(
  writer: ChangeLogWriter,
  groupId: string,
  { toIndex }: { toIndex: number },
): void {
  findGroup(writer, groupId);
  const others = categoryGroups(writer.changeLog.readAll())
    .map(({ id }) => id)
    .filter((id) => id !== groupId);
  for (const [position, id] of placeAt(others, groupId, toIndex)) {
    write(writer, id, "CategoryGroupPlaced", { version: 1, position });
  }
}

/**
 * Puts a Category at `toIndex` among the Categories of `groupId`, which may be
 * its own Category Group (a reorder) or another one (a move).
 */
export function moveCategory(
  writer: ChangeLogWriter,
  categoryId: string,
  { groupId, toIndex }: { groupId: string; toIndex: number },
): void {
  findCategory(writer, categoryId);
  const others = findGroup(writer, groupId)
    .categories.map(({ id }) => id)
    .filter((id) => id !== categoryId);
  for (const [position, id] of placeAt(others, categoryId, toIndex)) {
    write(writer, id, "CategoryPlaced", { version: 1, groupId, position });
  }
}

/**
 * Hides a Category: it leaves the Month Budget view and the Category pickers,
 * and its history stays. Refused while it has money Available (or is
 * Overspent) in the current Month, or has Assignments in later Months, so
 * hiding never makes money vanish.
 */
export function hideCategory(
  writer: ChangeLogWriter,
  categoryId: string,
  { currentMonth }: { currentMonth: Month },
): void {
  const { category } = findCategory(writer, categoryId);
  const records = writer.changeLog.readAll();
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
  write(writer, categoryId, "CategoryHidden", { version: 1 });
}

/** Brings a hidden Category back. */
export function unhideCategory(
  writer: ChangeLogWriter,
  categoryId: string,
): void {
  findCategory(writer, categoryId);
  write(writer, categoryId, "CategoryUnhidden", { version: 1 });
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
export function deleteCategory(
  writer: ChangeLogWriter,
  categoryId: string,
): void {
  const { category } = findCategory(writer, categoryId);
  if (categoryUsed(writer.changeLog.readAll(), categoryId)) {
    throw new CategoryInUseError(categoryId, category.name);
  }
  write(writer, categoryId, "CategoryDeleted", { version: 1 });
}

/** Deletes a Category Group with no Categories in it, hidden ones included. */
export function deleteCategoryGroup(
  writer: ChangeLogWriter,
  groupId: string,
): void {
  const group = findGroup(writer, groupId);
  if (group.categories.length > 0) {
    throw new Error(
      `${group.name} still has Categories. Move or delete them first.`,
    );
  }
  write(writer, groupId, "CategoryGroupDeleted", { version: 1 });
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

function findCategory(writer: ChangeLogWriter, categoryId: string) {
  for (const group of categoryGroups(writer.changeLog.readAll())) {
    const category = group.categories.find(({ id }) => id === categoryId);
    if (category) return { group, category };
  }
  throw new Error("There is no such Category");
}

function findGroup(writer: ChangeLogWriter, groupId: string) {
  const group = categoryGroups(writer.changeLog.readAll()).find(
    ({ id }) => id === groupId,
  );
  if (!group) throw new Error("There is no such Category Group");
  return group;
}

function validName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name can't be blank");
  return trimmed;
}

function write<Record extends CategoriesRecord>(
  writer: ChangeLogWriter,
  subjectId: string,
  type: Record["type"],
  payload: Record["payload"],
): void {
  writer.write(subjectId, type, payload);
}
