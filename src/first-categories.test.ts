import { beforeEach, describe, expect, it } from "vitest";
import {
  addFirstCategoryWithUndo,
  addStarterSetWithUndo,
} from "./first-categories";
import {
  type ChangeLogWriter,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "./kernel/change-log";
import { money } from "./kernel/money";
import { openAccount } from "./slices/accounts/commands";
import { setAssignment } from "./slices/assignments/commands";
import { createBudget } from "./slices/budget-setup/commands";
import { categoryGroups } from "./slices/categories";

let writer: ChangeLogWriter;

const outline = () =>
  categoryGroups(writer.changeLog.readAll()).map(({ name, categories }) => [
    name,
    categories.map((category) => category.name),
  ]);

beforeEach(() => {
  writer = createChangeLogWriter(createInMemoryChangeLog(), "this-device");
  createBudget(writer, { currency: "USD" });
});

describe("adding the first Category", () => {
  it("adds it in a new Category Group, and Undo takes both away", () => {
    const undo = addFirstCategoryWithUndo(writer, {
      name: " Rent ",
      groupName: " Bills ",
    });
    expect(outline()).toEqual([["Bills", ["Rent"]]]);

    undo();
    expect(outline()).toEqual([]);
  });

  it.each([
    ["Rent", " "],
    [" ", "Bills"],
  ])("writes nothing when a name is blank (%j, %j)", (name, groupName) => {
    expect(() =>
      addFirstCategoryWithUndo(writer, { name, groupName }),
    ).toThrow();
    expect(outline()).toEqual([]);
  });
});

describe("the starter set", () => {
  it("is added, and Undo takes every Group and Category away", () => {
    const undo = addStarterSetWithUndo(writer);
    expect(outline().map(([name]) => name)).toEqual([
      "Bills",
      "Everyday",
      "Savings",
    ]);

    undo();
    expect(outline()).toEqual([]);
  });

  it("can't be undone once a Category is used, and the attempt writes nothing", () => {
    const undo = addStarterSetWithUndo(writer);
    openAccount(writer, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100_000, "USD"),
    });
    const rent = categoryGroups(writer.changeLog.readAll())[0].categories[0];
    setAssignment(writer, {
      categoryId: rent.id,
      month: "2026-10",
      amount: money(5000, "USD"),
    });
    const before = outline();

    expect(undo).toThrow();
    expect(outline()).toEqual(before);
  });
});
