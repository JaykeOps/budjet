import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import type { AccountOpened } from "../accounts/records";
import { type AssignmentSet, assignmentSubject } from "../assignments/records";
import type { BudgetCreated } from "../budget-setup/records";
import type { TransactionRecorded } from "../transactions/records";
import { available, readyToAssign, spending } from "./index";

/** A Budget in USD, seeded with the records other slices publish. */
function budget() {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, "this-device");
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  return {
    openAccount(openingBalance: number) {
      writer.write<AccountOpened["type"], AccountOpened["payload"]>(
        crypto.randomUUID(),
        "AccountOpened",
        {
          version: 1,
          name: "Checking",
          kind: "checking",
          openingBalance: money(openingBalance, "USD"),
        },
      );
    },
    assign(categoryId: string, assigned: Month, amount: number) {
      writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
        assignmentSubject(categoryId, assigned),
        "AssignmentSet",
        {
          version: 1,
          categoryId,
          month: assigned,
          amount: money(amount, "USD"),
        },
      );
    },
    /** Records a Transaction: a negative amount goes out, a positive one comes in. */
    record(date: string, amount: number, categoryId?: string) {
      writer.write<TransactionRecorded["type"], TransactionRecorded["payload"]>(
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
    readyToAssign: () => readyToAssign(changeLog.readAll()),
    spending: (categoryId: string, of: Month) =>
      spending(changeLog.readAll(), categoryId, of),
    available: (categoryId: string, of: Month) =>
      available(changeLog.readAll(), categoryId, of),
  };
}

describe("Budget Totals", () => {
  it("has no Ready to Assign before a Budget exists", () => {
    expect(readyToAssign([])).toBeUndefined();
  });

  it("puts every Opening Balance in Ready to Assign", () => {
    const totals = budget();
    expect(totals.readyToAssign()).toEqual(money(0, "USD"));

    totals.openAccount(100000);
    totals.openAccount(25050);

    expect(totals.readyToAssign()).toEqual(money(125050, "USD"));
  });

  it("takes every Assignment in every Month out of Ready to Assign, and can go below zero", () => {
    const totals = budget();
    totals.openAccount(100000);

    totals.assign("rent", "2026-10", 80000);
    totals.assign("groceries", "2026-10", 30000);
    totals.assign("rent", "2026-11", 10000);

    // Opening Balances of $1,000 and Assignments of $1,200 give −$200.
    expect(totals.readyToAssign()).toEqual(money(-20000, "USD"));
  });

  it("counts only the latest Assignment for a Category in a Month", () => {
    const totals = budget();
    totals.openAccount(100000);

    totals.assign("rent", "2026-10", 80000);
    totals.assign("rent", "2026-10", 60000);

    expect(totals.readyToAssign()).toEqual(money(40000, "USD"));
  });

  it("puts money coming in with no Category in Ready to Assign, and nothing else", () => {
    const totals = budget();
    totals.openAccount(100000);

    totals.record("2026-10-25", 300000);
    totals.record("2026-10-12", -4550, "groceries");
    totals.record("2026-10-13", 1000, "groceries");

    expect(totals.readyToAssign()).toEqual(money(400000, "USD"));
  });

  it("calculates a Category's spending and Available in a Month from its Assignment and Transactions", () => {
    const totals = budget();
    totals.openAccount(100000);
    totals.assign("groceries", "2026-10", 40000);

    totals.record("2026-10-01", -4550, "groceries");
    totals.record("2026-10-31", -10000, "groceries");
    totals.record("2026-10-15", 1000, "groceries");
    // Other Months, other Categories and money with no Category don't count.
    totals.record("2026-11-01", -2000, "groceries");
    totals.record("2026-09-30", -3000, "groceries");
    totals.record("2026-10-12", -7000, "rent");
    totals.record("2026-10-25", 300000);

    expect(totals.spending("groceries", "2026-10")).toEqual(
      money(14550, "USD"),
    );
    // $400 assigned + $10 coming in − $145.50 going out.
    expect(totals.available("groceries", "2026-10")).toEqual(
      money(26450, "USD"),
    );
    expect(totals.spending("dining-out", "2026-10")).toEqual(money(0, "USD"));
    expect(totals.available("dining-out", "2026-10")).toEqual(money(0, "USD"));
  });

  it("lets spending take a Category's Available below zero", () => {
    const totals = budget();
    totals.assign("groceries", "2026-10", 1000);

    totals.record("2026-10-01", -4550, "groceries");

    expect(totals.available("groceries", "2026-10")).toEqual(
      money(-3550, "USD"),
    );
  });
});
