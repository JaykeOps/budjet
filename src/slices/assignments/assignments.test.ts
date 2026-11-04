import { describe, expect, it } from "vitest";
import {
  type ChangeLogWriter,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import { month } from "../../kernel/month";
import type { BudgetCreated } from "../budget-setup/records";
import { available, readyToAssign } from "../budget-totals";
import { copyLastMonth, moveMoney, setAssignment } from "./commands";
import { assignment, takeBack } from "./index";
import { type AssignmentSet, assignmentSubject } from "./records";

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

  describe("Take-backs", () => {
    const rent = { categoryId: "rent", month: october };
    const dollars = (amount: number) => money(amount * 100, "USD");

    function moveFromRent(writer: ChangeLogWriter, amount: number) {
      moveMoney(writer, {
        fromCategoryId: "rent",
        toCategoryId: "groceries",
        month: october,
        amount: dollars(amount),
      });
    }

    /** Stores an Assignment the way older versions could: below zero. */
    function storeNegativeAssignment(writer: ChangeLogWriter, amount: number) {
      writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
        assignmentSubject(rent.categoryId, rent.month),
        "AssignmentSet",
        { version: 1, ...rent, amount: dollars(-amount) },
      );
    }

    it("has no Take-back until money leaves a Category beyond its Assignment", () => {
      const { changeLog, writer } = budgetIn("USD");
      setAssignment(writer, { ...rent, amount: dollars(100) });
      moveFromRent(writer, 100);

      const records = changeLog.readAll();
      expect(assignment(records, "rent", october)).toEqual(dollars(0));
      expect(takeBack(records, "rent", october)).toBeUndefined();
    });

    it("takes back what moving money needs beyond the Assignment, which stops at zero", () => {
      const { changeLog, writer } = budgetIn("USD");
      setAssignment(writer, { ...rent, amount: dollars(30) });

      moveFromRent(writer, 50);

      const records = changeLog.readAll();
      expect(assignment(records, "rent", october)).toEqual(dollars(0));
      expect(takeBack(records, "rent", october)).toEqual(dollars(20));
      expect(assignment(records, "groceries", october)).toEqual(dollars(50));
      expect(takeBack(records, "rent", november)).toBeUndefined();
    });

    it("turns an Assignment typed below zero into zero plus a Take-back", () => {
      const { changeLog, writer } = budgetIn("USD");

      setAssignment(writer, { ...rent, amount: dollars(-40) });

      const records = changeLog.readAll();
      expect(assignment(records, "rent", october)).toEqual(dollars(0));
      expect(takeBack(records, "rent", october)).toEqual(dollars(40));
    });

    it("keeps one total per Category per Month, growing with each Take-back", () => {
      const { changeLog, writer } = budgetIn("USD");

      moveFromRent(writer, 20);
      setAssignment(writer, { ...rent, amount: dollars(-5) });
      moveFromRent(writer, 10);

      expect(takeBack(changeLog.readAll(), "rent", october)).toEqual(
        dollars(35),
      );
    });

    it("keeps a Take-back when the Assignment is raised later", () => {
      const { changeLog, writer } = budgetIn("USD");
      moveFromRent(writer, 20);

      setAssignment(writer, { ...rent, amount: dollars(70) });
      moveMoney(writer, {
        fromCategoryId: "groceries",
        toCategoryId: "rent",
        month: october,
        amount: dollars(5),
      });

      const records = changeLog.readAll();
      expect(assignment(records, "rent", october)).toEqual(dollars(75));
      expect(takeBack(records, "rent", october)).toEqual(dollars(20));
    });

    it("keeps the most recent Take-back, whichever device's records arrive first", () => {
      const laptop = budgetIn("USD", "laptop", () => 5000);
      moveFromRent(laptop.writer, 20);
      // The phone's clock is behind, but it has seen the laptop's records.
      const phoneLog = createInMemoryChangeLog();
      phoneLog.append(laptop.changeLog.readAll());
      const phone = createChangeLogWriter(phoneLog, "phone", {
        now: () => 1000,
      });
      moveFromRent(phone, 10);
      const [first, second] = [laptop.changeLog.readAll(), phoneLog.readAll()];

      for (const order of [
        [first, second],
        [second, first],
      ]) {
        const merged = createInMemoryChangeLog();
        for (const records of order) merged.append(records);
        expect(takeBack(merged.readAll(), "rent", october)).toEqual(
          dollars(30),
        );
      }
    });

    it("leaves Ready to Assign unchanged overall by a Move Money that includes a Take-back", () => {
      const { changeLog, writer } = budgetIn("USD");
      setAssignment(writer, {
        ...rent,
        month: month(2026, 9),
        amount: dollars(600),
      });
      setAssignment(writer, { ...rent, amount: dollars(10) });
      const before = readyToAssign(changeLog.readAll());

      moveFromRent(writer, 52.5);

      const records = changeLog.readAll();
      expect(readyToAssign(records)).toEqual(before);
      expect(available(records, "rent", october)).toEqual(dollars(557.5));
      expect(available(records, "groceries", october)).toEqual(dollars(52.5));
    });

    it("keeps the later of two Take-backs made without seeing each other", () => {
      const laptop = budgetIn("USD", "laptop", () => 5000);
      const phone = budgetIn("USD", "phone", () => 1000);
      moveFromRent(laptop.writer, 20);
      moveFromRent(phone.writer, 10);
      const [first, second] = [
        laptop.changeLog.readAll(),
        phone.changeLog.readAll(),
      ];

      for (const order of [
        [first, second],
        [second, first],
      ]) {
        const merged = createInMemoryChangeLog();
        for (const records of order) merged.append(records);
        expect(takeBack(merged.readAll(), "rent", october)).toEqual(
          dollars(20),
        );
      }
    });

    describe("an Assignment stored below zero", () => {
      it("reads as zero plus a Take-back of the difference", () => {
        const { changeLog, writer } = budgetIn("USD");
        storeNegativeAssignment(writer, 50);

        const records = changeLog.readAll();
        expect(assignment(records, "rent", october)).toEqual(dollars(0));
        expect(takeBack(records, "rent", october)).toEqual(dollars(50));
      });

      it("keeps its Take-back when a new Assignment replaces it", () => {
        const { changeLog, writer } = budgetIn("USD");
        storeNegativeAssignment(writer, 50);

        setAssignment(writer, { ...rent, amount: dollars(70) });

        const records = changeLog.readAll();
        expect(assignment(records, "rent", october)).toEqual(dollars(70));
        expect(takeBack(records, "rent", october)).toEqual(dollars(50));
      });

      it("adds to its Take-back when more money leaves", () => {
        const { changeLog, writer } = budgetIn("USD");
        storeNegativeAssignment(writer, 50);

        moveFromRent(writer, 20);

        const records = changeLog.readAll();
        expect(assignment(records, "rent", october)).toEqual(dollars(0));
        expect(takeBack(records, "rent", october)).toEqual(dollars(70));
      });

      it("adds to a Take-back recorded for the same Month on another device", () => {
        const { changeLog, writer } = budgetIn("USD");
        moveFromRent(writer, 30);
        storeNegativeAssignment(writer, 50);

        expect(takeBack(changeLog.readAll(), "rent", october)).toEqual(
          dollars(80),
        );
      });

      it("copies into next Month as zero, leaving the Take-back behind", () => {
        const { changeLog, writer } = budgetIn("USD");
        storeNegativeAssignment(writer, 50);

        copyLastMonth(writer, { month: november });

        const records = changeLog.readAll();
        expect(assignment(records, "rent", november)).toEqual(dollars(0));
        expect(takeBack(records, "rent", november)).toBeUndefined();
      });
    });

    it("never stores a negative Assignment", () => {
      const { changeLog, writer } = budgetIn("USD");

      moveFromRent(writer, 20);
      setAssignment(writer, { ...rent, amount: dollars(-5) });

      const stored = changeLog
        .readAll()
        .filter(({ type }) => type === "AssignmentSet")
        .map(({ payload }) => (payload as AssignmentSet["payload"]).amount);
      expect(stored.every(({ minorUnits }) => minorUnits >= 0)).toBe(true);
    });
  });
});
