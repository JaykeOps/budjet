import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDeviceChangeLog,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { seedRecord } from "../../kernel/seed-record";
import { createBudget } from "./commands";
import { budget } from "./index";
import type { BudgetCreated } from "./records";

function setUp(now?: () => number) {
  const changeLog = createInMemoryChangeLog();
  return {
    changeLog,
    log: createDeviceChangeLog(changeLog, "this-device", { now }),
  };
}

describe("Budget Setup", () => {
  it("has no Budget until one is created", () => {
    const { changeLog, log } = setUp();
    expect(budget(changeLog.readAll())).toBeUndefined();

    createBudget(log, { currency: "SEK" });

    expect(budget(changeLog.readAll())).toMatchObject({ currency: "SEK" });
  });

  it("only creates a Budget in a real currency", () => {
    const { changeLog, log } = setUp();

    expect(() => createBudget(log, { currency: "XYZ" })).toThrow(
      /XYZ is not a currency/,
    );
    expect(budget(changeLog.readAll())).toBeUndefined();
  });

  it("keeps the one Budget once it exists", () => {
    const { changeLog, log } = setUp();
    createBudget(log, { currency: "EUR" });

    expect(() => createBudget(log, { currency: "USD" })).toThrow(
      /already has a Budget/,
    );
    expect(budget(changeLog.readAll())).toMatchObject({ currency: "EUR" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the Month it was created in, on the creating device's calendar", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 31, 23, 59) });
    const { changeLog, log } = setUp(() =>
      new Date(2026, 10, 1, 0, 30).getTime(),
    );
    createBudget(log, { currency: "USD" });

    expect(budget(changeLog.readAll())).toMatchObject({
      firstMonth: "2026-10",
    });
  });

  it("starts a Budget recorded without its first Month at the Month of the record's time", () => {
    const { changeLog, log } = setUp(() =>
      new Date(2026, 9, 31, 23, 59).getTime(),
    );
    seedRecord<BudgetCreated["type"], BudgetCreated["payload"]>(
      log,
      "budget",
      "BudgetCreated",
      { version: 1, currency: "USD" },
    );

    expect(budget(changeLog.readAll())).toMatchObject({
      firstMonth: "2026-10",
    });
  });
});
