import { describe, expect, it } from "vitest";
import {
  createDeviceChangeLog,
  createInMemoryChangeLog,
  type DeviceChangeLog,
} from "../../kernel/change-log";
import { asId, type CategoryId } from "../../kernel/id";
import { money } from "../../kernel/money";
import { month } from "../../kernel/month";
import { seedRecord } from "../../kernel/seed-record";
import type { BudgetCreated } from "../budget-setup/records";
import { available, readyToAssign } from "../budget-totals";
import {
  copyLastMonth,
  moveMoney,
  restoreAssignment,
  setAssignment,
} from "./commands";
import { assignment, takeBack } from "./index";
import { type AssignmentSet, assignmentSubject } from "./records";

const diningOutId = asId<CategoryId>("dining-out");
const groceriesId = asId<CategoryId>("groceries");
const phoneId = asId<CategoryId>("phone");
const powerId = asId<CategoryId>("power");
const rentId = asId<CategoryId>("rent");

const diningOut = diningOutId;
const groceries = groceriesId;
const power = powerId;

const october = month(2026, 10);
const november = month(2026, 11);

function budgetIn(
  currency: string,
  deviceId = "this-device",
  now?: () => number,
) {
  const changeLog = createInMemoryChangeLog();
  const log = createDeviceChangeLog(changeLog, deviceId, { now });
  seedRecord<BudgetCreated["type"], BudgetCreated["payload"]>(
    log,
    "budget",
    "BudgetCreated",
    { version: 1, currency },
  );
  return { changeLog, log };
}

describe("Assignments", () => {
  it("has no Assignment for a Category until one is set", () => {
    const { changeLog } = budgetIn("USD");
    expect(assignment(changeLog.readAll(), rentId, october)).toBeUndefined();
  });

  it("sets a Category's Assignment for one Month only", () => {
    const { changeLog, log } = budgetIn("USD");

    setAssignment(log, {
      categoryId: rentId,
      month: october,
      amount: money(120000, "USD"),
    });

    expect(assignment(changeLog.readAll(), rentId, october)).toEqual(
      money(120000, "USD"),
    );
    expect(assignment(changeLog.readAll(), rentId, november)).toBeUndefined();
    expect(assignment(changeLog.readAll(), groceries, october)).toBeUndefined();
  });

  it("replaces the Assignment when it is set again", () => {
    const { changeLog, log } = budgetIn("USD");
    const rent = { categoryId: rentId, month: october };

    setAssignment(log, { ...rent, amount: money(120000, "USD") });
    setAssignment(log, { ...rent, amount: money(115000, "USD") });

    expect(assignment(changeLog.readAll(), rentId, october)).toEqual(
      money(115000, "USD"),
    );
  });

  it("keeps the most recent Assignment, even from a device whose clock runs behind", () => {
    const laptop = budgetIn("USD", "laptop", () => 5000);
    const rent = { categoryId: rentId, month: october };
    setAssignment(laptop.log, { ...rent, amount: money(100, "USD") });
    // The phone's clock is behind, but it has seen the laptop's records.
    const phoneLog = createInMemoryChangeLog();
    phoneLog.append(laptop.changeLog.readAll());
    const phone = createDeviceChangeLog(phoneLog, "phone", { now: () => 1000 });
    setAssignment(phone, { ...rent, amount: money(200, "USD") });
    const [first, second] = [laptop.changeLog.readAll(), phoneLog.readAll()];

    for (const order of [
      [first, second],
      [second, first],
    ]) {
      const merged = createInMemoryChangeLog();
      for (const records of order) merged.append(records);
      expect(assignment(merged.readAll(), rentId, october)).toEqual(
        money(200, "USD"),
      );
    }
  });

  it("keeps the Assignment in the Budget's currency", () => {
    const { changeLog, log } = budgetIn("USD");

    expect(() =>
      setAssignment(log, {
        categoryId: rentId,
        month: october,
        amount: money(100, "EUR"),
      }),
    ).toThrow(/in USD, the Budget's currency/);
    expect(assignment(changeLog.readAll(), rentId, october)).toBeUndefined();
  });

  describe("copy last Month", () => {
    it("fills each Category that has no Assignment this Month with last Month's amount", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, {
        categoryId: rentId,
        month: october,
        amount: money(120000, "USD"),
      });
      setAssignment(log, {
        categoryId: groceries,
        month: october,
        amount: money(35050, "USD"),
      });

      copyLastMonth(log, { month: november });

      const records = changeLog.readAll();
      expect(assignment(records, rentId, november)).toEqual(
        money(120000, "USD"),
      );
      expect(assignment(records, groceries, november)).toEqual(
        money(35050, "USD"),
      );
      expect(assignment(records, power, november)).toBeUndefined();
    });

    it("never overwrites an Assignment already set this Month, even one of zero", () => {
      const { changeLog, log } = budgetIn("USD");
      for (const categoryId of ["rent", "power"].map(asId<CategoryId>)) {
        setAssignment(log, {
          categoryId,
          month: october,
          amount: money(10000, "USD"),
        });
      }
      setAssignment(log, {
        categoryId: rentId,
        month: november,
        amount: money(9000, "USD"),
      });
      setAssignment(log, {
        categoryId: power,
        month: november,
        amount: money(0, "USD"),
      });

      copyLastMonth(log, { month: november });

      const records = changeLog.readAll();
      expect(assignment(records, rentId, november)).toEqual(money(9000, "USD"));
      expect(assignment(records, power, november)).toEqual(money(0, "USD"));
    });

    it("leaves out the Categories it is told to skip, such as hidden ones", () => {
      const { changeLog, log } = budgetIn("USD");
      for (const categoryId of ["rent", "phone"].map(asId<CategoryId>)) {
        setAssignment(log, {
          categoryId,
          month: october,
          amount: money(10000, "USD"),
        });
      }

      copyLastMonth(log, {
        month: november,
        skipping: [phoneId],
      });

      const records = changeLog.readAll();
      expect(assignment(records, rentId, november)).toEqual(
        money(10000, "USD"),
      );
      expect(assignment(records, phoneId, november)).toBeUndefined();
    });

    it("sets nothing for a Category whose Assignment last Month was zero", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, {
        categoryId: rentId,
        month: october,
        amount: money(0, "USD"),
      });

      copyLastMonth(log, { month: november });

      expect(assignment(changeLog.readAll(), rentId, november)).toBeUndefined();
    });

    it("copies only from the Month just before", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, {
        categoryId: rentId,
        month: month(2026, 9),
        amount: money(10000, "USD"),
      });

      copyLastMonth(log, { month: november });

      expect(assignment(changeLog.readAll(), rentId, november)).toBeUndefined();
    });
  });

  describe("move money", () => {
    it("lowers one Category's Assignment and raises another's by the same amount in the same Month", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, {
        categoryId: diningOut,
        month: october,
        amount: money(20000, "USD"),
      });
      setAssignment(log, {
        categoryId: groceries,
        month: october,
        amount: money(30000, "USD"),
      });

      moveMoney(log, {
        fromCategoryId: diningOut,
        toCategoryId: groceries,
        month: october,
        amount: money(5000, "USD"),
      });

      const records = changeLog.readAll();
      expect(assignment(records, diningOut, october)).toEqual(
        money(15000, "USD"),
      );
      expect(assignment(records, groceries, october)).toEqual(
        money(35000, "USD"),
      );
      expect(assignment(records, groceries, november)).toBeUndefined();
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
        const { changeLog, log } = budgetIn("USD");
        const before = changeLog.readAll();

        expect(() =>
          moveMoney(log, {
            fromCategoryId: groceries,
            toCategoryId: asId<CategoryId>(toCategoryId),
            month: october,
            amount,
          }),
        ).toThrow(error);
        expect(changeLog.readAll()).toEqual(before);
      },
    );
  });

  describe("Take-backs", () => {
    const rent = { categoryId: rentId, month: october };
    const dollars = (amount: number) => money(amount * 100, "USD");

    function moveFromRent(log: DeviceChangeLog, amount: number) {
      moveMoney(log, {
        fromCategoryId: rentId,
        toCategoryId: groceries,
        month: october,
        amount: dollars(amount),
      });
    }

    /** Stores an Assignment the way older versions could: below zero. */
    function storeNegativeAssignment(log: DeviceChangeLog, amount: number) {
      seedRecord<AssignmentSet["type"], AssignmentSet["payload"]>(
        log,
        assignmentSubject(rent.categoryId, rent.month),
        "AssignmentSet",
        { version: 1, ...rent, amount: dollars(-amount) },
      );
    }

    it("has no Take-back until money leaves a Category beyond its Assignment", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, { ...rent, amount: dollars(100) });
      moveFromRent(log, 100);

      const records = changeLog.readAll();
      expect(assignment(records, rentId, october)).toEqual(dollars(0));
      expect(takeBack(records, rentId, october)).toBeUndefined();
    });

    it("takes back what moving money needs beyond the Assignment, which stops at zero", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, { ...rent, amount: dollars(30) });

      moveFromRent(log, 50);

      const records = changeLog.readAll();
      expect(assignment(records, rentId, october)).toEqual(dollars(0));
      expect(takeBack(records, rentId, october)).toEqual(dollars(20));
      expect(assignment(records, groceries, october)).toEqual(dollars(50));
      expect(takeBack(records, rentId, november)).toBeUndefined();
    });

    it("turns an Assignment typed below zero into zero plus a Take-back", () => {
      const { changeLog, log } = budgetIn("USD");

      setAssignment(log, { ...rent, amount: dollars(-40) });

      const records = changeLog.readAll();
      expect(assignment(records, rentId, october)).toEqual(dollars(0));
      expect(takeBack(records, rentId, october)).toEqual(dollars(40));
    });

    it("keeps one total per Category per Month, growing with each Take-back", () => {
      const { changeLog, log } = budgetIn("USD");

      moveFromRent(log, 20);
      setAssignment(log, { ...rent, amount: dollars(-5) });
      moveFromRent(log, 10);

      expect(takeBack(changeLog.readAll(), rentId, october)).toEqual(
        dollars(35),
      );
    });

    it("keeps a Take-back when the Assignment is raised later", () => {
      const { changeLog, log } = budgetIn("USD");
      moveFromRent(log, 20);

      setAssignment(log, { ...rent, amount: dollars(70) });
      moveMoney(log, {
        fromCategoryId: groceries,
        toCategoryId: rentId,
        month: october,
        amount: dollars(5),
      });

      const records = changeLog.readAll();
      expect(assignment(records, rentId, october)).toEqual(dollars(75));
      expect(takeBack(records, rentId, october)).toEqual(dollars(20));
    });

    it("keeps the most recent Take-back, whichever device's records arrive first", () => {
      const laptop = budgetIn("USD", "laptop", () => 5000);
      moveFromRent(laptop.log, 20);
      // The phone's clock is behind, but it has seen the laptop's records.
      const phoneLog = createInMemoryChangeLog();
      phoneLog.append(laptop.changeLog.readAll());
      const phone = createDeviceChangeLog(phoneLog, "phone", {
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
        expect(takeBack(merged.readAll(), rentId, october)).toEqual(
          dollars(30),
        );
      }
    });

    it("leaves Ready to Assign unchanged overall by a Move Money that includes a Take-back", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, {
        ...rent,
        month: month(2026, 9),
        amount: dollars(600),
      });
      setAssignment(log, { ...rent, amount: dollars(10) });
      const before = readyToAssign(changeLog.readAll());

      moveFromRent(log, 52.5);

      const records = changeLog.readAll();
      expect(readyToAssign(records)).toEqual(before);
      expect(available(records, rentId, october)).toEqual(dollars(557.5));
      expect(available(records, groceries, october)).toEqual(dollars(52.5));
    });

    it("keeps the later of two Take-backs made without seeing each other", () => {
      const laptop = budgetIn("USD", "laptop", () => 5000);
      const phone = budgetIn("USD", "phone", () => 1000);
      moveFromRent(laptop.log, 20);
      moveFromRent(phone.log, 10);
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
        expect(takeBack(merged.readAll(), rentId, october)).toEqual(
          dollars(20),
        );
      }
    });

    describe("an Assignment stored below zero", () => {
      it("reads as zero plus a Take-back of the difference", () => {
        const { changeLog, log } = budgetIn("USD");
        storeNegativeAssignment(log, 50);

        const records = changeLog.readAll();
        expect(assignment(records, rentId, october)).toEqual(dollars(0));
        expect(takeBack(records, rentId, october)).toEqual(dollars(50));
      });

      it("keeps its Take-back when a new Assignment replaces it", () => {
        const { changeLog, log } = budgetIn("USD");
        storeNegativeAssignment(log, 50);

        setAssignment(log, { ...rent, amount: dollars(70) });

        const records = changeLog.readAll();
        expect(assignment(records, rentId, october)).toEqual(dollars(70));
        expect(takeBack(records, rentId, october)).toEqual(dollars(50));
      });

      it("adds to its Take-back when more money leaves", () => {
        const { changeLog, log } = budgetIn("USD");
        storeNegativeAssignment(log, 50);

        moveFromRent(log, 20);

        const records = changeLog.readAll();
        expect(assignment(records, rentId, october)).toEqual(dollars(0));
        expect(takeBack(records, rentId, october)).toEqual(dollars(70));
      });

      it("adds to a Take-back recorded for the same Month on another device", () => {
        const { changeLog, log } = budgetIn("USD");
        moveFromRent(log, 30);
        storeNegativeAssignment(log, 50);

        expect(takeBack(changeLog.readAll(), rentId, october)).toEqual(
          dollars(80),
        );
      });

      it("isn't copied into next Month, and leaves the Take-back behind", () => {
        const { changeLog, log } = budgetIn("USD");
        storeNegativeAssignment(log, 50);

        copyLastMonth(log, { month: november });

        const records = changeLog.readAll();
        expect(assignment(records, rentId, november)).toBeUndefined();
        expect(takeBack(records, rentId, november)).toBeUndefined();
      });
    });

    it("never stores a negative Assignment", () => {
      const { changeLog, log } = budgetIn("USD");

      moveFromRent(log, 20);
      setAssignment(log, { ...rent, amount: dollars(-5) });

      const stored = changeLog
        .readAll()
        .filter(({ type }) => type === "AssignmentSet")
        .map(({ payload }) => (payload as AssignmentSet["payload"]).amount);
      expect(stored.every(({ minorUnits }) => minorUnits >= 0)).toBe(true);
    });
  });

  describe("restoring", () => {
    const rent = { categoryId: rentId, month: october };

    it("writes back an Assignment and a Take-back, and zero for unset ones", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, { ...rent, amount: money(5000, "USD") });
      setAssignment(log, { ...rent, amount: money(-1000, "USD") });

      restoreAssignment(log, {
        ...rent,
        assigned: money(5000, "USD"),
        takenBack: undefined,
      });

      expect(assignment(changeLog.readAll(), rentId, october)).toEqual(
        money(5000, "USD"),
      );
      expect(takeBack(changeLog.readAll(), rentId, october)).toEqual(
        money(0, "USD"),
      );
    });

    it("writes nothing when nothing differs", () => {
      const { changeLog, log } = budgetIn("USD");
      setAssignment(log, { ...rent, amount: money(5000, "USD") });
      const before = changeLog.readAll().length;

      restoreAssignment(log, {
        ...rent,
        assigned: money(5000, "USD"),
        takenBack: undefined,
      });

      expect(changeLog.readAll().length).toBe(before);
    });

    it("gets the same numbers back over an old negative Assignment", () => {
      const { changeLog, log } = budgetIn("USD");
      seedRecord<AssignmentSet["type"], AssignmentSet["payload"]>(
        log,
        assignmentSubject(rentId, october),
        "AssignmentSet",
        { version: 1, ...rent, amount: money(-2000, "USD") },
      );

      restoreAssignment(log, {
        ...rent,
        assigned: money(0, "USD"),
        takenBack: money(500, "USD"),
      });

      expect(takeBack(changeLog.readAll(), rentId, october)).toEqual(
        money(500, "USD"),
      );
      expect(assignment(changeLog.readAll(), rentId, october)).toEqual(
        money(0, "USD"),
      );
    });
  });
});
