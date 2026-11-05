import { beforeEach, describe, expect, it } from "vitest";
import {
  createCategoryGroupWithUndo,
  createCategoryWithUndo,
  deleteCategoryGroupWithUndo,
  deleteCategoryWithUndo,
  hideCategoryWithUndo,
  moveThemAndDeleteWithUndo,
  renameCategoryGroupWithUndo,
  renameCategoryWithUndo,
  setSpentThisMonthWithUndo,
  unhideCategoryWithUndo,
} from "./category-changes";
import {
  type ChangeLogWriter,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "./kernel/change-log";
import { createBudget } from "./slices/budget-setup/commands";
import { categoryGroups } from "./slices/categories";
import { addStarterSet, deleteCategory } from "./slices/categories/commands";

let writer: ChangeLogWriter;

/** Each Category Group's name and its Categories' names, in order. */
const outline = () =>
  categoryGroups(writer.changeLog.readAll()).map(({ name, categories }) => [
    name,
    categories.map((category) => category.name),
  ]);

const group = (name: string) => {
  const found = categoryGroups(writer.changeLog.readAll()).find(
    (candidate) => candidate.name === name,
  );
  if (!found) throw new Error(`No Category Group ${name}`);
  return found;
};

const category = (name: string) => {
  const found = categoryGroups(writer.changeLog.readAll())
    .flatMap(({ categories }) => categories)
    .find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No Category ${name}`);
  return found;
};

const starter = [
  ["Bills", ["Rent", "Power", "Phone", "Internet"]],
  ["Everyday", ["Groceries", "Transport", "Dining Out"]],
  ["Savings", ["Emergency Fund"]],
];

beforeEach(() => {
  writer = createChangeLogWriter(createInMemoryChangeLog(), "phone");
  createBudget(writer, { currency: "USD" });
  addStarterSet(writer);
});

describe("undoing a change to Categories", () => {
  it("removes a Category or Category Group just added", () => {
    const undoCategory = createCategoryWithUndo(writer, {
      groupId: group("Bills").id,
      name: "Water",
    });
    const undoGroup = createCategoryGroupWithUndo(writer, { name: "Fun" });
    expect(outline()).toEqual([
      ["Bills", ["Rent", "Power", "Phone", "Internet", "Water"]],
      starter[1],
      starter[2],
      ["Fun", []],
    ]);

    undoCategory();
    undoGroup();

    expect(outline()).toEqual(starter);
  });

  it("writes the previous name back after a rename", () => {
    const undoCategory = renameCategoryWithUndo(writer, category("Rent").id, {
      name: "Mortgage",
    });
    const undoGroup = renameCategoryGroupWithUndo(writer, group("Bills").id, {
      name: "Fixed",
    });
    expect(outline()[0]).toEqual([
      "Fixed",
      ["Mortgage", "Power", "Phone", "Internet"],
    ]);

    undoCategory();
    undoGroup();

    expect(outline()).toEqual(starter);
  });

  it("hides and unhides in place", () => {
    const id = category("Power").id;

    const undoHide = hideCategoryWithUndo(writer, id);
    expect(category("Power").hidden).toBe(true);
    undoHide();
    expect(category("Power").hidden).toBe(false);

    hideCategoryWithUndo(writer, id);
    const undoUnhide = unhideCategoryWithUndo(writer, id);
    expect(category("Power").hidden).toBe(false);
    undoUnhide();
    expect(category("Power").hidden).toBe(true);
    expect(outline()).toEqual(starter);
  });

  it("brings a deleted Category back with a fresh id in the same place", () => {
    const { id } = category("Power");

    deleteCategoryWithUndo(writer, id)();

    expect(outline()).toEqual(starter);
    expect(category("Power").id).not.toBe(id);
  });

  it("brings a deleted hidden Category back hidden", () => {
    const { id } = category("Power");
    hideCategoryWithUndo(writer, id);

    deleteCategoryWithUndo(writer, id)();

    expect(category("Power").hidden).toBe(true);
  });

  it("brings a deleted empty Category Group back in the same place, left out as it was", () => {
    deleteCategory(writer, category("Emergency Fund").id);
    createCategoryGroupWithUndo(writer, { name: "Fun" });
    const { id } = group("Savings");

    deleteCategoryGroupWithUndo(writer, id)();

    expect(outline().map(([name]) => name)).toEqual([
      "Bills",
      "Everyday",
      "Savings",
      "Fun",
    ]);
    expect(group("Savings").id).not.toBe(id);
    expect(group("Savings").leftOutOfSpentThisMonth).toBe(true);
  });

  it("flips Leave out of Spent this Month back", () => {
    const { id } = group("Bills");

    const undo = setSpentThisMonthWithUndo(writer, id, { leftOut: true });
    expect(group("Bills").leftOutOfSpentThisMonth).toBe(true);
    undo();

    expect(group("Bills").leftOutOfSpentThisMonth).toBe(false);
  });
});

describe("Move them and delete", () => {
  it("moves a Category Group's Categories after the target's, then deletes it", () => {
    moveThemAndDeleteWithUndo(writer, group("Bills").id, group("Savings").id);

    expect(outline()).toEqual([
      starter[1],
      ["Savings", ["Emergency Fund", "Rent", "Power", "Phone", "Internet"]],
    ]);
  });

  it("moves hidden Categories too", () => {
    const { id } = category("Power");
    hideCategoryWithUndo(writer, id);

    moveThemAndDeleteWithUndo(writer, group("Bills").id, group("Savings").id);

    expect(category("Power").hidden).toBe(true);
    expect(group("Savings").categories.map(({ name }) => name)).toContain(
      "Power",
    );
  });

  it("undoes as a fresh Category Group in the same place, holding the same Categories", () => {
    const ids = group("Everyday").categories.map(({ id }) => id);
    const oldId = group("Everyday").id;

    moveThemAndDeleteWithUndo(writer, oldId, group("Bills").id)();

    expect(outline()).toEqual(starter);
    expect(group("Everyday").id).not.toBe(oldId);
    expect(group("Everyday").categories.map(({ id }) => id)).toEqual(ids);
  });

  it("refuses the Undo whole when another device deleted one of them", () => {
    const undo = moveThemAndDeleteWithUndo(
      writer,
      group("Everyday").id,
      group("Bills").id,
    );
    deleteCategory(writer, category("Transport").id);
    const before = outline();

    expect(undo).toThrow();

    expect(outline()).toEqual(before);
  });
});
