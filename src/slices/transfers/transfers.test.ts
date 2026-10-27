import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import { accountBalance } from "../accounts";
import type { AccountOpened } from "../accounts/records";
import type { AssignmentSet } from "../assignments/records";
import type { BudgetCreated } from "../budget-setup/records";
import { available, readyToAssign } from "../budget-totals";
import { deleteTransfer, editTransfer, makeTransfer } from "./commands";
import { transfers } from "./index";

/** A Budget in USD with two Accounts: "checking" holding $1,000 and "savings" holding $500. */
function budget() {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, "this-device");
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  for (const [id, name, cents] of [
    ["checking", "Checking", 100000],
    ["savings", "Savings", 50000],
  ] as const) {
    writer.write<AccountOpened["type"], AccountOpened["payload"]>(
      id,
      "AccountOpened",
      {
        version: 1,
        name,
        kind: id,
        openingBalance: money(cents, "USD"),
      },
    );
  }
  return {
    changeLog,
    writer,
    balance: (accountId: string) =>
      accountBalance(changeLog.readAll(), accountId),
  };
}

describe("Transfers", () => {
  it("moves money out of one Account and into another", () => {
    const { writer, balance } = budget();

    makeTransfer(writer, {
      fromAccountId: "checking",
      toAccountId: "savings",
      date: "2026-10-12",
      amount: money(20000, "USD"),
    });

    expect(balance("checking")).toEqual(money(80000, "USD"));
    expect(balance("savings")).toEqual(money(70000, "USD"));
  });

  it("leaves Ready to Assign and every Category's Available unchanged", () => {
    const { changeLog, writer } = budget();
    writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
      "groceries/2026-10",
      "AssignmentSet",
      {
        version: 1,
        categoryId: "groceries",
        month: "2026-10",
        amount: money(40000, "USD"),
      },
    );

    makeTransfer(writer, {
      fromAccountId: "savings",
      toAccountId: "checking",
      date: "2026-10-12",
      amount: money(30000, "USD"),
    });

    expect(readyToAssign(changeLog.readAll())).toEqual(money(110000, "USD"));
    expect(available(changeLog.readAll(), "groceries", "2026-10")).toEqual(
      money(40000, "USD"),
    );
  });

  it.each([
    [
      "the same Account on both ends",
      { toAccountId: "checking" },
      /two different Accounts/,
    ],
    [
      "an Account that doesn't exist",
      { fromAccountId: "wallet" },
      /No Account wallet/,
    ],
    [
      "an amount in another currency",
      { amount: money(100, "EUR") },
      /in USD, the Budget's currency/,
    ],
    ["no amount", { amount: money(0, "USD") }, /above zero/],
    ["a negative amount", { amount: money(-100, "USD") }, /above zero/],
    ["a date that isn't a calendar date", { date: "12/10/2026" }, /date/],
  ])("refuses a Transfer with %s", (_, change, error) => {
    const { writer, balance } = budget();

    expect(() =>
      makeTransfer(writer, {
        fromAccountId: "checking",
        toAccountId: "savings",
        date: "2026-10-12",
        amount: money(20000, "USD"),
        ...change,
      }),
    ).toThrow(error);
    expect(balance("checking")).toEqual(money(100000, "USD"));
    expect(balance("savings")).toEqual(money(50000, "USD"));
  });

  it("edits a Transfer, moving its money to match", () => {
    const { changeLog, writer, balance } = budget();
    const id = makeTransfer(writer, {
      fromAccountId: "checking",
      toAccountId: "savings",
      date: "2026-10-12",
      amount: money(20000, "USD"),
    });

    editTransfer(writer, id, {
      fromAccountId: "savings",
      toAccountId: "checking",
      date: "2026-10-14",
      amount: money(5000, "USD"),
      memo: "  Back again ",
    });

    expect(balance("checking")).toEqual(money(105000, "USD"));
    expect(balance("savings")).toEqual(money(45000, "USD"));
    expect(transfers(changeLog.readAll())).toEqual([
      {
        id,
        fromAccountId: "savings",
        toAccountId: "checking",
        date: "2026-10-14",
        amount: money(5000, "USD"),
        memo: "Back again",
      },
    ]);
  });

  it("refuses an edit that breaks the Transfer rules", () => {
    const { writer, balance } = budget();
    const id = makeTransfer(writer, {
      fromAccountId: "checking",
      toAccountId: "savings",
      date: "2026-10-12",
      amount: money(20000, "USD"),
    });

    expect(() =>
      editTransfer(writer, id, {
        fromAccountId: "savings",
        toAccountId: "savings",
        date: "2026-10-12",
        amount: money(20000, "USD"),
      }),
    ).toThrow(/two different Accounts/);
    expect(balance("savings")).toEqual(money(70000, "USD"));
  });

  it("deletes a Transfer, giving both Accounts their money back", () => {
    const { changeLog, writer, balance } = budget();
    const id = makeTransfer(writer, {
      fromAccountId: "checking",
      toAccountId: "savings",
      date: "2026-10-12",
      amount: money(20000, "USD"),
    });

    deleteTransfer(writer, id);

    expect(balance("checking")).toEqual(money(100000, "USD"));
    expect(balance("savings")).toEqual(money(50000, "USD"));
    expect(transfers(changeLog.readAll())).toEqual([]);
  });

  it("refuses to edit or delete a Transfer that isn't in the Budget", () => {
    const { writer } = budget();
    const id = makeTransfer(writer, {
      fromAccountId: "checking",
      toAccountId: "savings",
      date: "2026-10-12",
      amount: money(20000, "USD"),
    });
    deleteTransfer(writer, id);

    expect(() => deleteTransfer(writer, id)).toThrow(`No Transfer ${id}`);
    expect(() =>
      editTransfer(writer, "nope", {
        fromAccountId: "checking",
        toAccountId: "savings",
        date: "2026-10-12",
        amount: money(100, "USD"),
      }),
    ).toThrow("No Transfer nope");
  });

  it("lists Transfers newest date first, the latest made first on the same date", () => {
    const { changeLog, writer } = budget();
    const make = (date: string, cents: number) =>
      makeTransfer(writer, {
        fromAccountId: "checking",
        toAccountId: "savings",
        date,
        amount: money(cents, "USD"),
      });

    const first = make("2026-10-12", 100);
    const later = make("2026-10-20", 200);
    const sameDay = make("2026-10-12", 300);
    editTransfer(writer, first, {
      fromAccountId: "checking",
      toAccountId: "savings",
      date: "2026-10-12",
      amount: money(150, "USD"),
    });

    expect(transfers(changeLog.readAll()).map(({ id }) => id)).toEqual([
      later,
      sameDay,
      first,
    ]);
  });

  it.each([
    ["the edit's device clock runs behind", -60_000],
    ["the edit's device clock runs ahead", 60_000],
  ])("keeps the most recent change from two devices when %s", (_, skew) => {
    const { changeLog, writer, balance } = budget();
    const id = makeTransfer(writer, {
      fromAccountId: "checking",
      toAccountId: "savings",
      date: "2026-10-12",
      amount: money(20000, "USD"),
    });
    const now = Date.now();
    const phone = createChangeLogWriter(changeLog, "phone", {
      now: () => now + skew,
    });

    editTransfer(phone, id, {
      fromAccountId: "checking",
      toAccountId: "savings",
      date: "2026-10-12",
      amount: money(1000, "USD"),
    });
    deleteTransfer(writer, id);

    expect(transfers(changeLog.readAll())).toEqual([]);
    expect(balance("checking")).toEqual(money(100000, "USD"));
  });

  it("refuses a Transfer before a Budget exists", () => {
    const writer = createChangeLogWriter(createInMemoryChangeLog(), "device");

    expect(() =>
      makeTransfer(writer, {
        fromAccountId: "checking",
        toAccountId: "savings",
        date: "2026-10-12",
        amount: money(20000, "USD"),
      }),
    ).toThrow(/Create a Budget first/);
  });
});
