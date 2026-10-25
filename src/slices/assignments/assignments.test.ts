import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import { month } from "../../kernel/month";
import type { BudgetCreated } from "../budget-setup/records";
import { setAssignment } from "./commands";
import { assignment } from "./index";

const october = month(2026, 10);
const november = month(2026, 11);

function budgetIn(
  currency: string,
  deviceId = "this-device",
  now?: () => number,
) {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, deviceId, { now });
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency },
  );
  return { changeLog, writer };
}

describe("Assignments", () => {
  it("has no Assignment for a Category until one is set", () => {
    const { changeLog } = budgetIn("USD");
    expect(assignment(changeLog.readAll(), "rent", october)).toBeUndefined();
  });

  it("sets a Category's Assignment for one Month only", () => {
    const { changeLog, writer } = budgetIn("USD");

    setAssignment(writer, {
      categoryId: "rent",
      month: october,
      amount: money(120000, "USD"),
    });

    expect(assignment(changeLog.readAll(), "rent", october)).toEqual(
      money(120000, "USD"),
    );
    expect(assignment(changeLog.readAll(), "rent", november)).toBeUndefined();
    expect(
      assignment(changeLog.readAll(), "groceries", october),
    ).toBeUndefined();
  });

  it("replaces the Assignment when it is set again", () => {
    const { changeLog, writer } = budgetIn("USD");
    const rent = { categoryId: "rent", month: october };

    setAssignment(writer, { ...rent, amount: money(120000, "USD") });
    setAssignment(writer, { ...rent, amount: money(115000, "USD") });

    expect(assignment(changeLog.readAll(), "rent", october)).toEqual(
      money(115000, "USD"),
    );
  });

  it("keeps the most recent Assignment, even from a device whose clock runs behind", () => {
    const laptop = budgetIn("USD", "laptop", () => 5000);
    const rent = { categoryId: "rent", month: october };
    setAssignment(laptop.writer, { ...rent, amount: money(100, "USD") });
    // The phone's clock is behind, but it has seen the laptop's records.
    const phoneLog = createInMemoryChangeLog();
    phoneLog.append(laptop.changeLog.readAll());
    const phone = createChangeLogWriter(phoneLog, "phone", { now: () => 1000 });
    setAssignment(phone, { ...rent, amount: money(200, "USD") });
    const [first, second] = [laptop.changeLog.readAll(), phoneLog.readAll()];

    for (const order of [
      [first, second],
      [second, first],
    ]) {
      const merged = createInMemoryChangeLog();
      for (const records of order) merged.append(records);
      expect(assignment(merged.readAll(), "rent", october)).toEqual(
        money(200, "USD"),
      );
    }
  });

  it("keeps the Assignment in the Budget's currency", () => {
    const { changeLog, writer } = budgetIn("USD");

    expect(() =>
      setAssignment(writer, {
        categoryId: "rent",
        month: october,
        amount: money(100, "EUR"),
      }),
    ).toThrow(/in USD, the Budget's currency/);
    expect(assignment(changeLog.readAll(), "rent", october)).toBeUndefined();
  });
});
