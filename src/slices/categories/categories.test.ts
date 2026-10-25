import { describe, expect, it } from "vitest";
import {
  type ChangeLog,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { type AssignmentSet, assignmentSubject } from "../assignments/records";
import type { BudgetCreated } from "../budget-setup/records";
import type { TransactionRecorded } from "../transactions/records";
import {
  addStarterSet,
  CategoryInUseError,
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  hideCategory,
  moveCategory,
  moveCategoryGroup,
  renameCategory,
  renameCategoryGroup,
  unhideCategory,
} from "./commands";
import { type CategoryGroup, categoryGroups } from "./index";

function setUp() {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, "this-device");
  return { writer, groups: () => categoryGroups(changeLog.readAll()) };
}

/** Each Category Group's name followed by its Categories' names, in order. */
function outline(groups: readonly CategoryGroup[]) {
  return groups.map((group) => [
    group.name,
    group.categories.map((category) => category.name),
  ]);
}

describe("Categories", () => {
  it("has no Category Groups before the starter set is added", () => {
    const { groups } = setUp();
    expect(groups()).toEqual([]);
  });

  it("starts a new Budget with the starter set of ordinary, visible Categories", () => {
    const { writer, groups } = setUp();

    addStarterSet(writer);

    expect(outline(groups())).toEqual([
      ["Bills", ["Rent", "Power", "Phone", "Internet"]],
      ["Everyday", ["Groceries", "Transport", "Dining Out"]],
      ["Savings", ["Emergency Fund"]],
    ]);
    const all = groups().flatMap((group) => [group, ...group.categories]);
    expect(all.every((thing) => thing.hidden === false)).toBe(true);
  });

  it("adds a new Category Group, and Categories in it, at the end", () => {
    const { writer, groups } = setUp();
    addStarterSet(writer);

    const fun = createCategoryGroup(writer, { name: "Fun" });
    createCategory(writer, { groupId: fun, name: "Games" });
    createCategory(writer, { groupId: fun, name: "  Concerts " });

    expect(outline(groups()).at(-1)).toEqual(["Fun", ["Games", "Concerts"]]);
  });

  it("only creates a Category inside an existing Category Group", () => {
    const { writer } = setUp();
    expect(() =>
      createCategory(writer, { groupId: "nowhere", name: "Games" }),
    ).toThrow(/no such Category Group/);
  });

  it("refuses a blank name", () => {
    const { writer, groups } = setUp();
    expect(() => createCategoryGroup(writer, { name: "  " })).toThrow(
      /can't be blank/,
    );
    expect(groups()).toEqual([]);
  });

  it("renames Category Groups and Categories", () => {
    const { writer, groups } = setUp();
    addStarterSet(writer);
    const [bills] = groups();

    renameCategoryGroup(writer, bills.id, { name: "Fixed costs" });
    renameCategory(writer, bills.categories[2].id, { name: "Mobile" });

    expect(outline(groups())[0]).toEqual([
      "Fixed costs",
      ["Rent", "Power", "Mobile", "Internet"],
    ]);
  });

  it("only renames a Category that exists, to a name that isn't blank", () => {
    const { writer, groups } = setUp();
    addStarterSet(writer);
    const rent = groups()[0].categories[0];

    expect(() => renameCategory(writer, "nothing", { name: "X" })).toThrow(
      /no such Category/,
    );
    expect(() => renameCategory(writer, rent.id, { name: "" })).toThrow(
      /can't be blank/,
    );
    expect(groups()[0].categories[0].name).toBe("Rent");
  });

  it("reorders Category Groups", () => {
    const { writer, groups } = setUp();
    addStarterSet(writer);
    const [, everyday, savings] = groups();

    moveCategoryGroup(writer, savings.id, { toIndex: 0 });
    expect(groups().map(({ name }) => name)).toEqual([
      "Savings",
      "Bills",
      "Everyday",
    ]);

    moveCategoryGroup(writer, everyday.id, { toIndex: 1 });
    expect(groups().map(({ name }) => name)).toEqual([
      "Savings",
      "Everyday",
      "Bills",
    ]);
  });

  it("reorders Categories within their Category Group", () => {
    const { writer, groups } = setUp();
    addStarterSet(writer);
    const [bills] = groups();
    const internet = bills.categories[3];

    moveCategory(writer, internet.id, { groupId: bills.id, toIndex: 1 });

    expect(outline(groups())[0]).toEqual([
      "Bills",
      ["Rent", "Internet", "Power", "Phone"],
    ]);
  });

  it("moves a Category to another Category Group", () => {
    const { writer, groups } = setUp();
    addStarterSet(writer);
    const [bills, everyday] = groups();
    const phone = bills.categories[2];

    moveCategory(writer, phone.id, { groupId: everyday.id, toIndex: 1 });

    expect(outline(groups()).slice(0, 2)).toEqual([
      ["Bills", ["Rent", "Power", "Internet"]],
      ["Everyday", ["Groceries", "Phone", "Transport", "Dining Out"]],
    ]);
  });

  it("only moves to a Category Group that exists, and a place within it", () => {
    const { writer, groups } = setUp();
    addStarterSet(writer);
    const [bills, , savings] = groups();
    const rent = bills.categories[0];

    expect(() =>
      moveCategory(writer, rent.id, { groupId: "nowhere", toIndex: 0 }),
    ).toThrow(/no such Category Group/);
    expect(() =>
      moveCategory(writer, rent.id, { groupId: savings.id, toIndex: 2 }),
    ).toThrow(/no place 2/);
    expect(() => moveCategoryGroup(writer, bills.id, { toIndex: 3 })).toThrow(
      /no place 3/,
    );
    expect(outline(groups())).toEqual(outline(groupsAfterStarterSet()));
  });

  it("keeps the most recent reorder when two devices reorder, in either order", () => {
    const orders = [false, true].map((laptopFirst) => {
      const shared = setUp();
      addStarterSet(shared.writer);
      const records = createInMemoryChangeLog();
      records.append(shared.writer.changeLog.readAll());
      const [, everyday, savings] = categoryGroups(records.readAll());

      // Two devices each start from the same records; the phone's clock runs
      // behind, but it reorders after seeing the laptop's change.
      const laptop = deviceCopy(records, "laptop", 2_000_000_000_000);
      moveCategoryGroup(laptop.writer, savings.id, { toIndex: 0 });
      const phone = deviceCopy(laptop.changeLog, "phone", 1);
      moveCategoryGroup(phone.writer, everyday.id, { toIndex: 0 });

      const merged = createInMemoryChangeLog();
      const sources = [laptop.changeLog, phone.changeLog];
      for (const source of laptopFirst ? sources : sources.reverse()) {
        const seen = new Set(merged.readAll().map(({ id }) => id));
        merged.append(source.readAll().filter(({ id }) => !seen.has(id)));
      }
      return categoryGroups(merged.readAll()).map(({ name }) => name);
    });

    expect(orders[0]).toEqual(["Everyday", "Savings", "Bills"]);
    expect(orders[1]).toEqual(orders[0]);
  });
});

function groupsAfterStarterSet() {
  const { writer, groups } = setUp();
  addStarterSet(writer);
  return groups();
}

/** A device holding a copy of the given records, with its own clock. */
function deviceCopy(source: ChangeLog, deviceId: string, now: number) {
  const changeLog = createInMemoryChangeLog();
  changeLog.append(source.readAll());
  return {
    changeLog,
    writer: createChangeLogWriter(changeLog, deviceId, { now: () => now }),
  };
}

/** A Budget in USD with the starter set, and a way to seed the money records other slices publish. */
function budgetWithStarterSet() {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, "this-device");
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  addStarterSet(writer);
  const groups = () => categoryGroups(changeLog.readAll());
  const find = (name: string) => {
    const category = groups()
      .flatMap((group) => group.categories)
      .find((category) => category.name === name);
    if (!category) throw new Error(`No Category ${name}`);
    return category;
  };
  return {
    writer,
    groups,
    find,
    id: (name: string) => find(name).id,
    assign(categoryId: string, month: Month, amount: number) {
      writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
        assignmentSubject(categoryId, month),
        "AssignmentSet",
        { version: 1, categoryId, month, amount: money(amount, "USD") },
      );
    },
    spend(categoryId: string, date: string, amount: number) {
      writer.write<TransactionRecorded["type"], TransactionRecorded["payload"]>(
        crypto.randomUUID(),
        "TransactionRecorded",
        {
          version: 1,
          accountId: "checking",
          date,
          amount: money(-amount, "USD"),
          categoryId,
        },
      );
    },
  };
}

describe("Hiding Categories", () => {
  it("hides a Category with nothing Available and nothing assigned later, and keeps it listed as hidden", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.assign(phone, "2026-09", 5000);
    budget.spend(phone, "2026-09-20", 5000);

    hideCategory(budget.writer, phone, { currentMonth: "2026-10" });

    expect(budget.find("Phone").hidden).toBe(true);
    expect(budget.find("Rent").hidden).toBe(false);
  });

  it("brings a hidden Category back when it is unhidden", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    hideCategory(budget.writer, phone, { currentMonth: "2026-10" });

    unhideCategory(budget.writer, phone);

    expect(budget.find("Phone").hidden).toBe(false);
  });

  it("refuses to hide a Category that has money Available this Month", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.assign(phone, "2026-09", 5000);

    expect(() =>
      hideCategory(budget.writer, phone, { currentMonth: "2026-10" }),
    ).toThrow(/Phone still has \$50\.00 Available/);
    expect(budget.find("Phone").hidden).toBe(false);
  });

  it("refuses to hide an Overspent Category", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.spend(phone, "2026-10-02", 1000);

    expect(() =>
      hideCategory(budget.writer, phone, { currentMonth: "2026-10" }),
    ).toThrow(/Phone still has -\$10\.00 Available/);
  });

  it("refuses to hide a Category with Assignments in later Months", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.assign(phone, "2026-12", 5000);

    expect(() =>
      hideCategory(budget.writer, phone, { currentMonth: "2026-10" }),
    ).toThrow(/Phone has Assignments in later Months/);
    expect(budget.find("Phone").hidden).toBe(false);
  });
});

describe("Deleting Categories and Category Groups", () => {
  it("deletes a Category that was never used", () => {
    const budget = budgetWithStarterSet();

    deleteCategory(budget.writer, budget.id("Phone"));

    expect(outline(budget.groups())[0]).toEqual([
      "Bills",
      ["Rent", "Power", "Internet"],
    ]);
  });

  it("refuses to delete a Category with Transactions or Assignments, and offers to hide it instead", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    const power = budget.id("Power");
    budget.spend(phone, "2026-10-02", 1000);
    budget.assign(power, "2026-10", 0);

    expect(() => deleteCategory(budget.writer, phone)).toThrow(
      CategoryInUseError,
    );
    expect(() => deleteCategory(budget.writer, power)).toThrow(
      "Power has Transactions or Assignments, so it can't be deleted. You can hide it instead.",
    );
    expect(outline(budget.groups())[0]).toEqual([
      "Bills",
      ["Rent", "Power", "Phone", "Internet"],
    ]);
  });

  it("deletes an empty Category Group, but not one with Categories in it", () => {
    const budget = budgetWithStarterSet();
    const [, , savings] = budget.groups();

    expect(() => deleteCategoryGroup(budget.writer, savings.id)).toThrow(
      "Savings still has Categories. Move or delete them first.",
    );

    deleteCategory(budget.writer, budget.id("Emergency Fund"));
    deleteCategoryGroup(budget.writer, savings.id);

    expect(outline(budget.groups()).map(([name]) => name)).toEqual([
      "Bills",
      "Everyday",
    ]);
  });

  it("counts a hidden Category as being in its Category Group", () => {
    const budget = budgetWithStarterSet();
    const [, , savings] = budget.groups();
    hideCategory(budget.writer, budget.id("Emergency Fund"), {
      currentMonth: "2026-10",
    });

    expect(() => deleteCategoryGroup(budget.writer, savings.id)).toThrow(
      /still has Categories/,
    );
  });
});
