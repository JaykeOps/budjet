import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { createBudget } from "./commands";
import { budget } from "./index";

function setUp() {
  const changeLog = createInMemoryChangeLog();
  return { changeLog, writer: createChangeLogWriter(changeLog, "this-device") };
}

describe("Budget Setup", () => {
  it("has no Budget until one is created", () => {
    const { changeLog, writer } = setUp();
    expect(budget(changeLog.readAll())).toBeUndefined();

    createBudget(writer, { currency: "SEK" });

    expect(budget(changeLog.readAll())).toMatchObject({ currency: "SEK" });
  });

  it("only creates a Budget in a real currency", () => {
    const { changeLog, writer } = setUp();

    expect(() => createBudget(writer, { currency: "XYZ" })).toThrow(
      /XYZ is not a currency/,
    );
    expect(budget(changeLog.readAll())).toBeUndefined();
  });

  it("keeps the one Budget once it exists", () => {
    const { changeLog, writer } = setUp();
    createBudget(writer, { currency: "EUR" });

    expect(() => createBudget(writer, { currency: "USD" })).toThrow(
      /already has a Budget/,
    );
    expect(budget(changeLog.readAll())).toMatchObject({ currency: "EUR" });
  });
});
