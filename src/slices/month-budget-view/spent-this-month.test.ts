import { describe, expect, it } from "vitest";
import {
  type ChangeLogWriter,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import type { AccountOpened } from "../accounts/records";
import { type AssignmentSet, assignmentSubject } from "../assignments/records";
import type { BudgetCreated } from "../budget-setup/records";
import { available, readyToAssign, spending } from "../budget-totals";
import { categoryGroups } from "../categories";
import type {
  CategoryCreated,
  CategoryGroupCreated,
  CategoryGroupSpentThisMonthSet,
  CategoryHidden,
  CategoryPlaced,
} from "../categories/records";
import type { TransactionRecorded } from "../transactions/records";
import { spentThisMonth } from "./index";

const october: Month = "2026-10";
const september: Month = "2026-09";

/** A Budget in USD with an Everyday and a Savings Group, seeded with the records other slices publish. */
function budget() {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, "this-device");
  seed<BudgetCreated>(writer, "budget", "BudgetCreated", {
    version: 1,
    currency: "USD",
  });
  seed<AccountOpened>(writer, "checking", "AccountOpened", {
    version: 1,
    name: "Checking",
    kind: "checking",
    openingBalance: money(500_000, "USD"),
  });
  const group = (id: string, position: number) =>
    seed<CategoryGroupCreated>(writer, id, "CategoryGroupCreated", {
      version: 1,
      name: id,
      position,
    });
  const category = (id: string, groupId: string) =>
    seed<CategoryCreated>(writer, id, "CategoryCreated", {
      version: 1,
      groupId,
      name: id,
      position: 0,
    });
  group("everyday", 0);
  group("savings", 1);
  category("groceries", "everyday");
  category("holiday", "savings");

  return {
    assign(categoryId: string, of: Month, amount: number) {
      seed<AssignmentSet>(
        writer,
        assignmentSubject(categoryId, of),
        "AssignmentSet",
        {
          version: 1,
          categoryId,
          month: of,
          amount: money(amount, "USD"),
        },
      );
    },
    /** Records a Transaction: a negative amount goes out, a positive one comes in. */
    record(date: string, amount: number, categoryId?: string) {
      seed<TransactionRecorded>(
        writer,
        crypto.randomUUID(),
        "TransactionRecorded",
        {
          version: 1,
          accountId: "checking",
          date,
          amount: money(amount, "USD"),
          ...(categoryId && { categoryId }),
        },
      );
    },
    leaveOut(groupId: string) {
      seed<CategoryGroupSpentThisMonthSet>(
        writer,
        groupId,
        "CategoryGroupSpentThisMonthSet",
        { version: 1, leftOut: true },
      );
    },
    move(categoryId: string, groupId: string) {
      seed<CategoryPlaced>(writer, categoryId, "CategoryPlaced", {
        version: 1,
        groupId,
        position: 0,
      });
    },
    hide(categoryId: string) {
      seed<CategoryHidden>(writer, categoryId, "CategoryHidden", {
        version: 1,
      });
    },
    records: () => changeLog.readAll(),
    /** Spent this Month as plain minor units, to read at a glance. */
    card(of: Month = october) {
      const card = spentThisMonth(changeLog.readAll(), of);
      return (
        card && {
          spent: card.spent.minorUnits,
          of: card.of.minorUnits,
          daily: card.daily.map(({ date, spending }) => [
            date,
            spending.minorUnits,
          ]),
        }
      );
    },
  };
}

function seed<Record extends { type: string; payload: unknown }>(
  writer: ChangeLogWriter,
  subjectId: string,
  type: Record["type"],
  payload: Record["payload"],
) {
  writer.write(subjectId, type, payload);
}

describe("Spent this Month", () => {
  it("is undefined before a Budget exists", () => {
    expect(spentThisMonth([], october)).toBeUndefined();
  });

  it("is zero, of zero, with no days, in an empty Month", () => {
    expect(budget().card()).toEqual({ spent: 0, of: 0, daily: [] });
  });

  it("gives the total, the Month's Assignments and each day's net Spending", () => {
    const b = budget();
    b.assign("groceries", october, 60_000);
    b.assign("holiday", october, 20_000);
    b.assign("groceries", september, 99_999);
    b.record("2026-10-03", -1_000, "groceries");
    b.record("2026-10-03", -500, "holiday");
    b.record("2026-10-01", -2_000, "groceries");
    b.record("2026-10-09", 300, "groceries");
    b.record("2026-09-30", -7_777, "groceries");
    b.record("2026-11-01", -8_888, "groceries");

    expect(b.card()).toEqual({
      spent: 3_200,
      of: 80_000,
      daily: [
        ["2026-10-01", 2_000],
        ["2026-10-03", 1_500],
        ["2026-10-09", -300],
      ],
    });
  });

  it("ignores money coming in with no Category", () => {
    const b = budget();
    b.record("2026-10-01", 250_000);

    expect(b.card()).toEqual({ spent: 0, of: 0, daily: [] });
  });

  it("goes negative when refunds outweigh money going out", () => {
    const b = budget();
    b.record("2026-10-02", -1_000, "groceries");
    b.record("2026-10-05", 4_000, "groceries");

    expect(b.card()?.spent).toBe(-3_000);
  });

  it("leaves out a left-out Group's Spending, Assignments and days", () => {
    const b = budget();
    b.assign("groceries", october, 60_000);
    b.assign("holiday", october, 20_000);
    b.record("2026-10-01", -1_000, "groceries");
    b.record("2026-10-02", -5_000, "holiday");

    b.leaveOut("savings");

    expect(b.card()).toEqual({
      spent: 1_000,
      of: 60_000,
      daily: [["2026-10-01", 1_000]],
    });
  });

  it("leaves out a refund in a left-out Group too", () => {
    const b = budget();
    b.record("2026-10-01", -1_000, "groceries");
    b.record("2026-10-01", 4_000, "holiday");
    b.record("2026-10-02", 4_000, "holiday");

    b.leaveOut("savings");

    expect(b.card()).toEqual({
      spent: 1_000,
      of: 0,
      daily: [["2026-10-01", 1_000]],
    });
  });

  it("counts a Category by the Group it is in now, including for past Months", () => {
    const b = budget();
    b.assign("groceries", september, 60_000);
    b.record("2026-09-15", -1_000, "groceries");
    b.leaveOut("savings");

    b.move("groceries", "savings");
    expect(b.card(september)).toEqual({ spent: 0, of: 0, daily: [] });

    b.move("groceries", "everyday");
    expect(b.card(september)).toEqual({
      spent: 1_000,
      of: 60_000,
      daily: [["2026-09-15", 1_000]],
    });
  });

  it("agrees with the rows it sums, which don't include hidden Categories", () => {
    const b = budget();
    b.assign("groceries", october, 60_000);
    b.record("2026-10-01", -1_000, "groceries");

    b.hide("groceries");

    expect(b.card()).toEqual({ spent: 0, of: 0, daily: [] });
  });

  it("changes nothing else when a Group is left out", () => {
    const b = budget();
    b.assign("holiday", october, 20_000);
    b.record("2026-10-02", -5_000, "holiday");
    const figures = () => ({
      available: available(b.records(), "holiday", october),
      spending: spending(b.records(), "holiday", october),
      readyToAssign: readyToAssign(b.records()),
      groups: categoryGroups(b.records()).map(({ name, categories }) => [
        name,
        categories.map(({ name }) => name),
      ]),
    });
    const before = figures();

    b.leaveOut("savings");

    expect(figures()).toEqual(before);
    expect(before.available?.minorUnits).toBe(15_000);
    expect(before.spending?.minorUnits).toBe(5_000);
    expect(before.readyToAssign?.minorUnits).toBe(480_000);
  });
});
