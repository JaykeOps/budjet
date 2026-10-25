import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import { month } from "../../kernel/month";
import type { BudgetCreated } from "../budget-setup/records";
import { copyLastMonth, moveMoney, setAssignment } from "./commands";
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

  describe("copy last Month", () => {
    it("fills each Category that has no Assignment this Month with last Month's amount", () => {
      const { changeLog, writer } = budgetIn("USD");
      setAssignment(writer, {
        categoryId: "rent",
        month: october,
        amount: money(120000, "USD"),
      });
      setAssignment(writer, {
        categoryId: "groceries",
        month: october,
        amount: money(35050, "USD"),
      });

      copyLastMonth(writer, { month: november });

      const records = changeLog.readAll();
      expect(assignment(records, "rent", november)).toEqual(
        money(120000, "USD"),
      );
      expect(assignment(records, "groceries", november)).toEqual(
        money(35050, "USD"),
      );
      expect(assignment(records, "power", november)).toBeUndefined();
    });

    it("never overwrites an Assignment already set this Month, even one of zero", () => {
      const { changeLog, writer } = budgetIn("USD");
      for (const categoryId of ["rent", "power"]) {
        setAssignment(writer, {
          categoryId,
          month: october,
          amount: money(10000, "USD"),
        });
      }
      setAssignment(writer, {
        categoryId: "rent",
        month: november,
        amount: money(9000, "USD"),
      });
      setAssignment(writer, {
        categoryId: "power",
        month: november,
        amount: money(0, "USD"),
      });

      copyLastMonth(writer, { month: november });

      const records = changeLog.readAll();
      expect(assignment(records, "rent", november)).toEqual(money(9000, "USD"));
      expect(assignment(records, "power", november)).toEqual(money(0, "USD"));
    });

    it("leaves out the Categories it is told to skip, such as hidden ones", () => {
      const { changeLog, writer } = budgetIn("USD");
      for (const categoryId of ["rent", "phone"]) {
        setAssignment(writer, {
          categoryId,
          month: october,
          amount: money(10000, "USD"),
        });
      }

      copyLastMonth(writer, { month: november, skipping: ["phone"] });

      const records = changeLog.readAll();
      expect(assignment(records, "rent", november)).toEqual(
        money(10000, "USD"),
      );
      expect(assignment(records, "phone", november)).toBeUndefined();
    });

    it("copies only from the Month just before", () => {
      const { changeLog, writer } = budgetIn("USD");
      setAssignment(writer, {
        categoryId: "rent",
        month: month(2026, 9),
        amount: money(10000, "USD"),
      });

      copyLastMonth(writer, { month: november });

      expect(assignment(changeLog.readAll(), "rent", november)).toBeUndefined();
    });
  });

  describe("move money", () => {
    it("lowers one Category's Assignment and raises another's by the same amount in the same Month", () => {
      const { changeLog, writer } = budgetIn("USD");
      setAssignment(writer, {
        categoryId: "dining-out",
        month: october,
        amount: money(20000, "USD"),
      });
      setAssignment(writer, {
        categoryId: "groceries",
        month: october,
        amount: money(30000, "USD"),
      });

      moveMoney(writer, {
        fromCategoryId: "dining-out",
        toCategoryId: "groceries",
        month: october,
        amount: money(5000, "USD"),
      });

      const records = changeLog.readAll();
      expect(assignment(records, "dining-out", october)).toEqual(
        money(15000, "USD"),
      );
      expect(assignment(records, "groceries", october)).toEqual(
        money(35000, "USD"),
      );
      expect(assignment(records, "groceries", november)).toBeUndefined();
    });

    it.each([
      [
        "to the same Category",
        "groceries",
        money(5000, "USD"),
        /two different Categories/,
      ],
      ["nothing", "dining-out", money(0, "USD"), /more than zero/],
      [
        "a negative amount",
        "dining-out",
        money(-5000, "USD"),
        /more than zero/,
      ],
      [
        "another currency",
        "dining-out",
        money(5000, "EUR"),
        /in USD, the Budget's currency/,
      ],
    ])(
      "refuses to move %s and changes no Assignment",
      (_, toCategoryId, amount, error) => {
        const { changeLog, writer } = budgetIn("USD");
        const before = changeLog.readAll();

        expect(() =>
          moveMoney(writer, {
            fromCategoryId: "groceries",
            toCategoryId,
            month: october,
            amount,
          }),
        ).toThrow(error);
        expect(changeLog.readAll()).toEqual(before);
      },
    );
  });
});
