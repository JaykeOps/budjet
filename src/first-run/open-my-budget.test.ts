import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../kernel/change-log";
import { money } from "../kernel/money";
import { accounts } from "../slices/accounts";
import { budget } from "../slices/budget-setup";
import { categoryGroups } from "../slices/categories";
import { openMyBudget } from "./open-my-budget";

function setUp() {
  const changeLog = createInMemoryChangeLog();
  return { changeLog, writer: createChangeLogWriter(changeLog, "this-device") };
}

const checking = {
  name: "Checking",
  kind: "checking",
  openingBalance: money(100_00, "SEK"),
} as const;
const cash = {
  name: "Cash",
  kind: "cash",
  openingBalance: money(5_00, "SEK"),
} as const;

describe("Open my Budget", () => {
  it("creates the Budget, then the Categories, then each Account, in that order", () => {
    const { changeLog, writer } = setUp();

    openMyBudget(writer, {
      currency: "SEK",
      categories: "starter",
      accounts: [checking, cash],
    });

    const types = changeLog.readAll().map(({ type }) => type);
    expect(types[0]).toBe("BudgetCreated");
    expect(types.slice(-2)).toEqual(["AccountOpened", "AccountOpened"]);
    expect(types.slice(1, -2)).toContain("CategoryCreated");
    expect(budget(changeLog.readAll())).toMatchObject({ currency: "SEK" });
    expect(accounts(changeLog.readAll()).map(({ name }) => name)).toEqual([
      "Checking",
      "Cash",
    ]);
  });

  it("adds no Categories when the user starts blank", () => {
    const { changeLog, writer } = setUp();

    openMyBudget(writer, {
      currency: "SEK",
      categories: "blank",
      accounts: [checking],
    });

    expect(categoryGroups(changeLog.readAll())).toEqual([]);
  });

  it.each([
    ["no Account", []],
    [
      "an Account in another currency",
      [{ ...checking, openingBalance: money(100_00, "USD") }],
    ],
    ["an Account with no name", [{ ...checking, name: "  " }]],
  ])("writes nothing when given %s", (_, given) => {
    const { changeLog, writer } = setUp();

    expect(() =>
      openMyBudget(writer, {
        currency: "SEK",
        categories: "starter",
        accounts: given,
      }),
    ).toThrow();

    expect(changeLog.readAll()).toEqual([]);
  });
});
