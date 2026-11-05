import { beforeEach, describe, expect, it } from "vitest";
import {
  createCategoryGroupWithUndo,
  createCategoryWithUndo,
  deleteCategoryGroupWithUndo,
  deleteCategoryWithUndo,
  hideCategoryWithUndo,
  moveOutWithUndo,
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
import { money } from "./kernel/money";
import type { Month } from "./kernel/month";
import { openAccount } from "./slices/accounts/commands";
import { assignment, takeBack } from "./slices/assignments";
import { setAssignment } from "./slices/assignments/commands";
import { createBudget } from "./slices/budget-setup/commands";
import { available, readyToAssign } from "./slices/budget-totals";
import { categoryGroups } from "./slices/categories";
import { addStarterSet, deleteCategory } from "./slices/categories/commands";
import { recordTransaction } from "./slices/transactions/commands";

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

describe("hiding a Category that holds money", () => {
  const october: Month = "2026-10";
  const november: Month = "2026-11";
  const december: Month = "2026-12";
  const account = () =>
    openAccount(writer, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(500_000, "USD"),
    });
  const assign = (name: string, month: Month, cents: number) =>
    setAssignment(writer, {
      categoryId: category(name).id,
      month,
      amount: money(cents, "USD"),
    });
  const spend = (name: string, accountId: string, cents: number) =>
    recordTransaction(writer, {
      accountId,
      categoryId: category(name).id,
      date: "2026-10-05",
      amount: money(-cents, "USD"),
    });
  const records = () => writer.changeLog.readAll();
  const availableIn = (name: string, month: Month = october) =>
    available(records(), category(name).id, month)?.minorUnits;
  const assignedIn = (name: string, month: Month = october) =>
    assignment(records(), category(name).id, month)?.minorUnits ?? 0;
  const takenBackIn = (name: string, month: Month = october) =>
    takeBack(records(), category(name).id, month)?.minorUnits ?? 0;
  const ready = () => readyToAssign(records())?.minorUnits;

  beforeEach(() => {
    account();
  });

  it("moves what it has to Ready to Assign, then hides it", () => {
    assign("Rent", october, 75_000);

    hideCategoryWithUndo(writer, category("Rent").id, { month: october });

    expect(category("Rent").hidden).toBe(true);
    expect(availableIn("Rent")).toBe(0);
    expect(ready()).toBe(500_000);
  });

  it("moves what it has to another Category", () => {
    assign("Rent", october, 75_000);
    assign("Power", october, 1_000);

    hideCategoryWithUndo(writer, category("Rent").id, {
      month: october,
      other: category("Power").id,
    });

    expect(availableIn("Rent")).toBe(0);
    expect(availableIn("Power")).toBe(76_000);
    expect(ready()).toBe(424_000);
  });

  it("takes back what this Month's Assignment can't cover", () => {
    assign("Rent", "2026-09", 70_000);
    assign("Rent", october, 5_000);

    hideCategoryWithUndo(writer, category("Rent").id, { month: october });

    expect(assignedIn("Rent")).toBe(0);
    expect(takenBackIn("Rent")).toBe(70_000);
    expect(assignedIn("Rent", "2026-09")).toBe(70_000);
    expect(availableIn("Rent")).toBe(0);
    expect(ready()).toBe(500_000);
  });

  it("covers an Overspent Category from Ready to Assign", () => {
    spend("Rent", account(), 1_800);

    hideCategoryWithUndo(writer, category("Rent").id, { month: october });

    expect(category("Rent").hidden).toBe(true);
    expect(availableIn("Rent")).toBe(0);
    expect(assignedIn("Rent")).toBe(1_800);
  });

  it("covers an Overspent Category from another, taking back if it must", () => {
    spend("Rent", account(), 1_800);
    assign("Power", "2026-09", 5_000);

    hideCategoryWithUndo(writer, category("Rent").id, {
      month: october,
      other: category("Power").id,
    });

    expect(availableIn("Rent")).toBe(0);
    expect(availableIn("Power")).toBe(3_200);
    expect(takenBackIn("Power")).toBe(1_800);
    expect(category("Rent").hidden).toBe(true);
  });

  it("clears later Months' Assignments to zero, however many, and only later ones", () => {
    assign("Rent", "2026-09", 2_000);
    assign("Rent", november, 3_000);
    assign("Rent", december, 4_000);
    assign("Rent", "2027-06", 5_000);

    hideCategoryWithUndo(writer, category("Rent").id, { month: october });

    expect(assignedIn("Rent", november)).toBe(0);
    expect(assignedIn("Rent", december)).toBe(0);
    expect(assignedIn("Rent", "2027-06")).toBe(0);
    expect(assignedIn("Rent", "2026-09")).toBe(2_000);
    expect(availableIn("Rent", "2027-06")).toBe(0);
    expect(ready()).toBe(500_000);
  });

  it("leaves a later Month's Take-back alone, so that Month reads Overspent", () => {
    assign("Rent", october, 10_000);
    assign("Rent", november, -3_000);

    hideCategoryWithUndo(writer, category("Rent").id, { month: october });

    expect(takenBackIn("Rent", november)).toBe(3_000);
    expect(availableIn("Rent")).toBe(0);
    expect(availableIn("Rent", november)).toBe(-3_000);
    expect(ready()).toBe(503_000);
  });

  it("writes nothing but the hide when there is no money to handle", () => {
    const before = records().length;

    const undo = hideCategoryWithUndo(writer, category("Rent").id, {
      month: october,
    });
    expect(records().length).toBe(before + 1);

    undo();
    expect(records().length).toBe(before + 2);
  });

  it("Undo writes the reverse of every step", () => {
    assign("Rent", "2026-09", 70_000);
    assign("Rent", october, 5_000);
    assign("Rent", november, 3_000);
    assign("Rent", december, 4_000);
    assign("Power", october, 1_000);
    const before = {
      ready: ready(),
      rent: availableIn("Rent", december),
      power: availableIn("Power"),
    };

    hideCategoryWithUndo(writer, category("Rent").id, {
      month: october,
      other: category("Power").id,
    })();

    expect(category("Rent").hidden).toBe(false);
    expect(assignedIn("Rent")).toBe(5_000);
    expect(takenBackIn("Rent")).toBe(0);
    expect(assignedIn("Rent", november)).toBe(3_000);
    expect(assignedIn("Rent", december)).toBe(4_000);
    expect(assignedIn("Power")).toBe(1_000);
    expect({
      ready: ready(),
      rent: availableIn("Rent", december),
      power: availableIn("Power"),
    }).toEqual(before);
  });

  it("Undo keeps a Take-back the Category had before hiding", () => {
    assign("Rent", "2026-09", 10_000);
    assign("Rent", october, -2_000);

    const undo = hideCategoryWithUndo(writer, category("Rent").id, {
      month: october,
    });
    expect(takenBackIn("Rent")).toBe(10_000);

    undo();
    expect(takenBackIn("Rent")).toBe(2_000);
    expect(availableIn("Rent")).toBe(8_000);
  });

  it("Undo writes nothing if the Category has since been deleted", () => {
    const id = category("Rent").id;
    const undo = hideCategoryWithUndo(writer, id, { month: october });
    deleteCategory(writer, id);
    const count = records().length;

    expect(undo).toThrow();
    expect(records().length).toBe(count);
  });

  it("undoing an Unhide hides it again, even holding money", () => {
    const id = category("Rent").id;
    hideCategoryWithUndo(writer, id, { month: october });
    assign("Rent", october, 1_250);
    assign("Rent", december, 500);

    const undo = unhideCategoryWithUndo(writer, id);
    expect(category("Rent").hidden).toBe(false);

    undo();
    expect(category("Rent").hidden).toBe(true);
    expect(availableIn("Rent")).toBe(1_250);
    expect(assignedIn("Rent", december)).toBe(500);
  });

  it("moves a hidden Category's money without changing whether it's hidden", () => {
    const id = category("Rent").id;
    hideCategoryWithUndo(writer, id, { month: october });
    assign("Rent", october, 1_250);

    const undo = moveOutWithUndo(writer, id, { month: october });

    expect(category("Rent").hidden).toBe(true);
    expect(availableIn("Rent")).toBe(0);

    undo();
    expect(availableIn("Rent")).toBe(1_250);
    expect(category("Rent").hidden).toBe(true);
  });
});
