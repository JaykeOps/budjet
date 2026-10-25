import { describe, expect, it } from "vitest";
import {
  type ChangeLog,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import {
  addStarterSet,
  createCategory,
  createCategoryGroup,
  moveCategory,
  moveCategoryGroup,
  renameCategory,
  renameCategoryGroup,
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
