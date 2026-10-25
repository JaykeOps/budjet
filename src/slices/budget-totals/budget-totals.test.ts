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
import { readyToAssign } from "./index";

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
    readyToAssign: () => readyToAssign(changeLog.readAll()),
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
});
