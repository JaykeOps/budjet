import type { ChangeLogWriter } from "../../kernel/change-log";
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
