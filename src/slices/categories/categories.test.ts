import { describe, expect, it } from "vitest";
import {
  type ChangeLog,
  createDeviceChangeLog,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import {
  type AccountId,
  asId,
  type CategoryGroupId,
  type CategoryId,
} from "../../kernel/id";
import { money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { seedRecord } from "../../kernel/seed-record";
import {
  type AssignmentSet,
  assignmentSubject,
  type TakeBackSet,
} from "../assignments/records";
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
  restoreHidden,
  setCategoryGroupSpentThisMonth,
  unhideCategory,
} from "./commands";
import { type CategoryGroup, categoryGroups } from "./index";
import { moveOutChoices } from "./move-out";

const nowhereId = asId<CategoryGroupId>("nowhere");

const nowhere = nowhereId;

const nothingId = asId<CategoryId>("nothing");

const nothing = nothingId;

const checking = asId<AccountId>("checking");

function setUp() {
  const changeLog = createInMemoryChangeLog();
  const log = createDeviceChangeLog(changeLog, "this-device");
  return { log, groups: () => categoryGroups(changeLog.readAll()) };
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
    const { log, groups } = setUp();

    addStarterSet(log);

    expect(outline(groups())).toEqual([
      ["Bills", ["Rent", "Power", "Phone", "Internet"]],
      ["Everyday", ["Groceries", "Transport", "Dining Out"]],
      ["Savings", ["Emergency Fund"]],
    ]);
    const all = groups().flatMap(({ categories }) => categories);
    expect(all.every((category) => category.hidden === false)).toBe(true);
  });

  it("adds a new Category Group, and Categories in it, at the end", () => {
    const { log, groups } = setUp();
    addStarterSet(log);

    const fun = createCategoryGroup(log, { name: "Fun" });
    createCategory(log, { groupId: fun, name: "Games" });
    createCategory(log, { groupId: fun, name: "  Concerts " });

    expect(outline(groups()).at(-1)).toEqual(["Fun", ["Games", "Concerts"]]);
  });

  it("only creates a Category inside an existing Category Group", () => {
    const { log } = setUp();
    expect(() =>
      createCategory(log, {
        groupId: nowhereId,
        name: "Games",
      }),
    ).toThrow(/no such Category Group/);
  });

  it("refuses a blank name", () => {
    const { log, groups } = setUp();
    expect(() => createCategoryGroup(log, { name: "  " })).toThrow(
      /can't be blank/,
    );
    expect(groups()).toEqual([]);
  });

  it("renames Category Groups and Categories", () => {
    const { log, groups } = setUp();
    addStarterSet(log);
    const [bills] = groups();

    renameCategoryGroup(log, bills.id, { name: "Fixed costs" });
    renameCategory(log, bills.categories[2].id, { name: "Mobile" });

    expect(outline(groups())[0]).toEqual([
      "Fixed costs",
      ["Rent", "Power", "Mobile", "Internet"],
    ]);
  });

  it("only renames a Category that exists, to a name that isn't blank", () => {
    const { log, groups } = setUp();
    addStarterSet(log);
    const rent = groups()[0].categories[0];

    expect(() => renameCategory(log, nothing, { name: "X" })).toThrow(
      /no such Category/,
    );
    expect(() => renameCategory(log, rent.id, { name: "" })).toThrow(
      /can't be blank/,
    );
    expect(groups()[0].categories[0].name).toBe("Rent");
  });

  it("reorders Category Groups", () => {
    const { log, groups } = setUp();
    addStarterSet(log);
    const [, everyday, savings] = groups();

    moveCategoryGroup(log, savings.id, { toIndex: 0 });
    expect(groups().map(({ name }) => name)).toEqual([
      "Savings",
      "Bills",
      "Everyday",
    ]);

    moveCategoryGroup(log, everyday.id, { toIndex: 1 });
    expect(groups().map(({ name }) => name)).toEqual([
      "Savings",
      "Everyday",
      "Bills",
    ]);
  });

  it("reorders Categories within their Category Group", () => {
    const { log, groups } = setUp();
    addStarterSet(log);
    const [bills] = groups();
    const internet = bills.categories[3];

    moveCategory(log, internet.id, { groupId: bills.id, toIndex: 1 });

    expect(outline(groups())[0]).toEqual([
      "Bills",
      ["Rent", "Internet", "Power", "Phone"],
    ]);
  });

  it("moves a Category to another Category Group", () => {
    const { log, groups } = setUp();
    addStarterSet(log);
    const [bills, everyday] = groups();
    const phone = bills.categories[2];

    moveCategory(log, phone.id, { groupId: everyday.id, toIndex: 1 });

    expect(outline(groups()).slice(0, 2)).toEqual([
      ["Bills", ["Rent", "Power", "Internet"]],
      ["Everyday", ["Groceries", "Phone", "Transport", "Dining Out"]],
    ]);
  });

  it("only moves to a Category Group that exists, and a place within it", () => {
    const { log, groups } = setUp();
    addStarterSet(log);
    const [bills, , savings] = groups();
    const rent = bills.categories[0];

    expect(() =>
      moveCategory(log, rent.id, {
        groupId: nowhereId,
        toIndex: 0,
      }),
    ).toThrow(/no such Category Group/);
    expect(() =>
      moveCategory(log, rent.id, { groupId: savings.id, toIndex: 2 }),
    ).toThrow(/no place 2/);
    expect(() => moveCategoryGroup(log, bills.id, { toIndex: 3 })).toThrow(
      /no place 3/,
    );
    expect(outline(groups())).toEqual(outline(groupsAfterStarterSet()));
  });

  it("keeps the most recent reorder when two devices reorder, in either order", () => {
    const orders = [false, true].map((laptopFirst) => {
      const shared = setUp();
      addStarterSet(shared.log);
      const records = createInMemoryChangeLog();
      records.append(shared.log.readAll());
      const [, everyday, savings] = categoryGroups(records.readAll());

      // Two devices each start from the same records; the phone's clock runs
      // behind, but it reorders after seeing the laptop's change.
      const laptop = deviceCopy(records, "laptop", 2_000_000_000_000);
      moveCategoryGroup(laptop.log, savings.id, { toIndex: 0 });
      const phone = deviceCopy(laptop.changeLog, "phone", 1);
      moveCategoryGroup(phone.log, everyday.id, { toIndex: 0 });

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

describe("Leaving a Category Group out of Spent this Month", () => {
  it("starts a new Category Group counted, whatever its name", () => {
    const { log, groups } = setUp();

    createCategoryGroup(log, { name: "Savings" });

    expect(groups()[0].leftOutOfSpentThisMonth).toBe(false);
  });

  it("starts the starter set with only its Savings Group left out", () => {
    const { log, groups } = setUp();

    addStarterSet(log);

    expect(
      groups().map(({ name, leftOutOfSpentThisMonth }) => [
        name,
        leftOutOfSpentThisMonth,
      ]),
    ).toEqual([
      ["Bills", false],
      ["Everyday", false],
      ["Savings", true],
    ]);
  });

  it("can be set and set back, and the latest setting wins", () => {
    const { log, groups } = setUp();
    const id = createCategoryGroup(log, { name: "Fun" });

    setCategoryGroupSpentThisMonth(log, id, { leftOut: true });
    expect(groups()[0].leftOutOfSpentThisMonth).toBe(true);

    setCategoryGroupSpentThisMonth(log, id, { leftOut: false });
    expect(groups()[0].leftOutOfSpentThisMonth).toBe(false);
  });

  it("is refused for a Category Group that doesn't exist", () => {
    const { log } = setUp();

    expect(() =>
      setCategoryGroupSpentThisMonth(log, nowhere, { leftOut: true }),
    ).toThrow(/no such Category Group/);
  });

  it("keeps the most recent setting when two devices set it, in either order", () => {
    const settings = [false, true].map((laptopFirst) => {
      const shared = setUp();
      const id = createCategoryGroup(shared.log, { name: "Fun" });

      // The phone's clock runs behind, but it sets this after seeing the
      // laptop's change, so the phone's is the most recent edit.
      const laptop = deviceCopy(shared.log, "laptop", 2_000_000_000_000);
      setCategoryGroupSpentThisMonth(laptop.log, id, { leftOut: true });
      const phone = deviceCopy(laptop.changeLog, "phone", 1);
      setCategoryGroupSpentThisMonth(phone.log, id, { leftOut: false });

      const merged = createInMemoryChangeLog();
      const sources = [laptop.changeLog, phone.changeLog];
      for (const source of laptopFirst ? sources : sources.reverse()) {
        const seen = new Set(merged.readAll().map(({ id }) => id));
        merged.append(source.readAll().filter(({ id }) => !seen.has(id)));
      }
      return categoryGroups(merged.readAll())[0].leftOutOfSpentThisMonth;
    });

    expect(settings).toEqual([false, false]);
  });
});

function groupsAfterStarterSet() {
  const { log, groups } = setUp();
  addStarterSet(log);
  return groups();
}

/** A device holding a copy of the given records, with its own clock. */
function deviceCopy(
  source: Pick<ChangeLog, "readAll">,
  deviceId: string,
  now: number,
) {
  const changeLog = createInMemoryChangeLog();
  changeLog.append(source.readAll());
  return {
    changeLog,
    log: createDeviceChangeLog(changeLog, deviceId, { now: () => now }),
  };
}

/** A Budget in USD with the starter set, and a way to seed the money records other slices publish. */
function budgetWithStarterSet() {
  const changeLog = createInMemoryChangeLog();
  const log = createDeviceChangeLog(changeLog, "this-device");
  seedRecord<BudgetCreated["type"], BudgetCreated["payload"]>(
    log,
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  addStarterSet(log);
  const groups = () => categoryGroups(changeLog.readAll());
  const find = (name: string) => {
    const category = groups()
      .flatMap((group) => group.categories)
      .find((category) => category.name === name);
    if (!category) throw new Error(`No Category ${name}`);
    return category;
  };
  return {
    log,
    groups,
    find,
    id: (name: string) => find(name).id,
    assign(categoryId: CategoryId, month: Month, amount: number) {
      seedRecord<AssignmentSet["type"], AssignmentSet["payload"]>(
        log,
        assignmentSubject(categoryId, month),
        "AssignmentSet",
        { version: 1, categoryId, month, amount: money(amount, "USD") },
      );
    },
    spend(categoryId: CategoryId, date: string, amount: number) {
      seedRecord<TransactionRecorded["type"], TransactionRecorded["payload"]>(
        log,
        crypto.randomUUID(),
        "TransactionRecorded",
        {
          version: 1,
          accountId: checking,
          date,
          amount: money(-amount, "USD"),
          categoryId,
        },
      );
    },
  };
}

describe("Hiding Categories", () => {
  it("hides a Category again whatever it holds when restoring", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.assign(phone, "2026-10", 5000);

    restoreHidden(budget.log, phone);

    expect(budget.find("Phone").hidden).toBe(true);
  });

  describe("where a Category's money can go", () => {
    const choices = (
      budget: ReturnType<typeof budgetWithStarterSet>,
      name: string,
    ) => moveOutChoices(budget.log.readAll(), budget.id(name), "2026-10");

    it("offers every other visible Category when moving money out", () => {
      const budget = budgetWithStarterSet();
      budget.assign(budget.id("Rent"), "2026-10", 75000);
      budget.assign(budget.id("Power"), "2026-10", 1000);
      hideCategory(budget.log, budget.id("Phone"), {
        currentMonth: "2026-10",
      });

      const found = choices(budget, "Rent");

      expect(found?.left).toEqual(money(75000, "USD"));
      expect(found?.others.map(({ name }) => name)).toEqual([
        "Power",
        "Internet",
        "Groceries",
        "Transport",
        "Dining Out",
        "Emergency Fund",
      ]);
      expect(found?.others[0]).toMatchObject({
        groupName: "Bills",
        available: money(1000, "USD"),
      });
    });

    it("offers only Categories that can cover the whole amount when covering", () => {
      const budget = budgetWithStarterSet();
      budget.spend(budget.id("Rent"), "2026-10-02", 1800);
      budget.assign(budget.id("Power"), "2026-09", 1800);
      budget.assign(budget.id("Phone"), "2026-10", 1799);

      expect(choices(budget, "Rent")?.others.map(({ name }) => name)).toEqual([
        "Power",
      ]);
    });

    it("lists later Months' Assignments, oldest first", () => {
      const budget = budgetWithStarterSet();
      budget.assign(budget.id("Rent"), "2027-01", 2000);
      budget.assign(budget.id("Rent"), "2026-11", 1000);
      budget.assign(budget.id("Rent"), "2026-10", 5000);

      expect(choices(budget, "Rent")?.later).toEqual([
        { month: "2026-11", amount: money(1000, "USD") },
        { month: "2027-01", amount: money(2000, "USD") },
      ]);
    });
  });

  it("hides a Category with nothing Available and nothing assigned later, and keeps it listed as hidden", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.assign(phone, "2026-09", 5000);
    budget.spend(phone, "2026-09-20", 5000);

    hideCategory(budget.log, phone, { currentMonth: "2026-10" });

    expect(budget.find("Phone").hidden).toBe(true);
    expect(budget.find("Rent").hidden).toBe(false);
  });

  it("brings a hidden Category back when it is unhidden", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    hideCategory(budget.log, phone, { currentMonth: "2026-10" });

    unhideCategory(budget.log, phone);

    expect(budget.find("Phone").hidden).toBe(false);
  });

  it("refuses to hide a Category that has money Available this Month", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.assign(phone, "2026-09", 5000);

    expect(() =>
      hideCategory(budget.log, phone, { currentMonth: "2026-10" }),
    ).toThrow(/Phone still has \$50\.00 Available/);
    expect(budget.find("Phone").hidden).toBe(false);
  });

  it("refuses to hide an Overspent Category", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.spend(phone, "2026-10-02", 1000);

    expect(() =>
      hideCategory(budget.log, phone, { currentMonth: "2026-10" }),
    ).toThrow(/Phone still has −\$10\.00 Available/);
  });

  it("refuses to hide a Category with Assignments in later Months", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    budget.assign(phone, "2026-12", 5000);

    expect(() =>
      hideCategory(budget.log, phone, { currentMonth: "2026-10" }),
    ).toThrow(/Phone has Assignments in later Months/);
    expect(budget.find("Phone").hidden).toBe(false);
  });
});

describe("Deleting Categories and Category Groups", () => {
  it("deletes a Category that was never used", () => {
    const budget = budgetWithStarterSet();

    deleteCategory(budget.log, budget.id("Phone"));

    expect(outline(budget.groups())[0]).toEqual([
      "Bills",
      ["Rent", "Power", "Internet"],
    ]);
  });

  it("deletes a Category whose Assignments are all zero, even one set and later cleared", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    const internet = budget.id("Internet");
    budget.assign(phone, "2026-10", 0);
    budget.assign(internet, "2026-10", 5000);
    budget.assign(internet, "2026-10", 0);

    deleteCategory(budget.log, phone);
    deleteCategory(budget.log, internet);

    expect(outline(budget.groups())[0]).toEqual(["Bills", ["Rent", "Power"]]);
  });

  it("refuses to delete a Category with Transactions or Assignments, and offers to hide it instead", () => {
    const budget = budgetWithStarterSet();
    const phone = budget.id("Phone");
    const power = budget.id("Power");
    budget.spend(phone, "2026-10-02", 1000);
    budget.assign(power, "2026-10", 2500);

    expect(() => deleteCategory(budget.log, phone)).toThrow(CategoryInUseError);
    expect(() => deleteCategory(budget.log, power)).toThrow(
      "Power has Transactions or Assignments, so it can't be deleted. You can hide it instead.",
    );
    expect(outline(budget.groups())[0]).toEqual([
      "Bills",
      ["Rent", "Power", "Phone", "Internet"],
    ]);
  });

  it("refuses to delete a Category with a Take-back", () => {
    const budget = budgetWithStarterSet();
    const power = budget.id("Power");
    seedRecord<TakeBackSet["type"], TakeBackSet["payload"]>(
      budget.log,
      assignmentSubject(power, "2026-10"),
      "TakeBackSet",
      {
        version: 1,
        categoryId: power,
        month: "2026-10",
        amount: money(2500, "USD"),
      },
    );

    expect(() => deleteCategory(budget.log, power)).toThrow(CategoryInUseError);
  });

  it("deletes an empty Category Group, but not one with Categories in it", () => {
    const budget = budgetWithStarterSet();
    const [, , savings] = budget.groups();

    expect(() => deleteCategoryGroup(budget.log, savings.id)).toThrow(
      "Savings still has Categories. Move or delete them first.",
    );

    deleteCategory(budget.log, budget.id("Emergency Fund"));
    deleteCategoryGroup(budget.log, savings.id);

    expect(outline(budget.groups()).map(([name]) => name)).toEqual([
      "Bills",
      "Everyday",
    ]);
  });

  it("counts a hidden Category as being in its Category Group", () => {
    const budget = budgetWithStarterSet();
    const [, , savings] = budget.groups();
    hideCategory(budget.log, budget.id("Emergency Fund"), {
      currentMonth: "2026-10",
    });

    expect(() => deleteCategoryGroup(budget.log, savings.id)).toThrow(
      /still has Categories/,
    );
  });
});
