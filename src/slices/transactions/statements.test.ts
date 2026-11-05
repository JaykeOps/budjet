import { describe, expect, it } from "vitest";
import {
  type ChangeLog,
  type ChangeLogWriter,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import { accountBalance, accountsTotal } from "../accounts";
import type {
  AccountClosed,
  AccountOpened,
  BalanceRedeclared,
} from "../accounts/records";
import type { BudgetCreated } from "../budget-setup/records";
import type {
  CategoryCreated,
  CategoryGroupCreated,
} from "../categories/records";
import type { TransferMade } from "../transfers/records";
import { deleteTransaction, recordTransaction } from "./commands";
import { statements } from "./index";

const usd = (cents: number) => money(cents, "USD");

/** A writer whose clock reads `at`, for what takes its date from the clock. */
function writerAt(changeLog: ChangeLog, at: Date) {
  return createChangeLogWriter(changeLog, "this-device", {
    now: () => at.getTime(),
  });
}

/** Moves money between two Accounts, in a Transfer with the id `id`. */
function transfer(
  writer: ChangeLogWriter,
  id: string,
  fromAccountId: string,
  toAccountId: string,
  date: string,
  cents: number,
) {
  writer.write<TransferMade["type"], TransferMade["payload"]>(
    id,
    "TransferMade",
    { version: 1, fromAccountId, toAccountId, date, amount: usd(cents) },
  );
}

function redeclare(writer: ChangeLogWriter, accountId: string, cents: number) {
  writer.write<BalanceRedeclared["type"], BalanceRedeclared["payload"]>(
    accountId,
    "BalanceRedeclared",
    { version: 1, balance: usd(cents) },
  );
}

/** A Budget whose Everyday ($1,000.00) and Wallet ($50.00) opened on 2 September 2100. */
function budget() {
  const changeLog = createInMemoryChangeLog();
  const writer = writerAt(changeLog, new Date(2100, 8, 2, 12));
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  const open = (id: string, name: string, cents: number) => {
    writer.write<AccountOpened["type"], AccountOpened["payload"]>(
      id,
      "AccountOpened",
      { version: 1, name, kind: "checking", openingBalance: usd(cents) },
    );
    return id;
  };
  const everyday = open("everyday", "Everyday", 100000);
  const wallet = open("wallet", "Wallet", 5000);
  writer.write<CategoryGroupCreated["type"], CategoryGroupCreated["payload"]>(
    "needs",
    "CategoryGroupCreated",
    { version: 1, name: "Needs", position: 0 },
  );
  writer.write<CategoryCreated["type"], CategoryCreated["payload"]>(
    "groceries",
    "CategoryCreated",
    { version: 1, name: "Groceries", groupId: "needs", position: 0 },
  );
  const record = (accountId: string, date: string, cents: number) =>
    recordTransaction(writer, {
      accountId,
      date,
      amount: usd(cents),
      ...(cents < 0 && { categoryId: "groceries" }),
    });
  return {
    changeLog,
    writer,
    everyday,
    wallet,
    record,
    read: (accountId?: string) => statements(changeLog.readAll(), accountId),
  };
}

describe("Statements", () => {
  it("adds up an Account's Month: money in, money out and the balance it ended at", () => {
    const { everyday, record, read } = budget();
    record(everyday, "2100-10-01", 323499);
    record(everyday, "2100-10-02", -239553);
    record(everyday, "2100-09-20", 10000);

    expect(
      read(everyday).map(({ month, moneyIn, moneyOut, endedAt }) => ({
        month,
        moneyIn,
        moneyOut,
        endedAt,
      })),
    ).toEqual([
      {
        month: "2100-10",
        moneyIn: usd(323499),
        moneyOut: usd(239553),
        endedAt: usd(193946),
      },
      {
        month: "2100-09",
        moneyIn: usd(110000),
        moneyOut: usd(0),
        endedAt: usd(110000),
      },
    ]);
  });

  it("lists a Month's entries newest first, down to the Opening Balance", () => {
    const { changeLog, everyday, record, read } = budget();
    const later = record(everyday, "2100-09-20", 100);
    const earlier = record(everyday, "2100-09-03", 200);
    const opening = changeLog
      .readAll()
      .find(
        ({ type, subjectId }) =>
          type === "AccountOpened" && subjectId === everyday,
      );

    expect(read(everyday)[0].entries).toEqual([
      expect.objectContaining({ kind: "transaction", id: later }),
      expect.objectContaining({ kind: "transaction", id: earlier }),
      {
        kind: "opening-balance",
        id: opening?.id,
        accountId: everyday,
        date: "2100-09-02",
        amount: usd(100000),
      },
    ]);
  });

  it("ends a Month at what was there by its last day, even when an older Transaction is recorded later", () => {
    const { everyday, record, read } = budget();
    record(everyday, "2100-11-05", -30000);
    record(everyday, "2100-10-05", -10000);

    expect(read(everyday).map(({ endedAt }) => endedAt)).toEqual([
      usd(60000),
      usd(90000),
      usd(100000),
    ]);
  });

  it("makes the newest Month end at the Account's balance, with every kind of entry", () => {
    const { changeLog, writer, everyday, wallet, record, read } = budget();
    record(everyday, "2100-09-20", -2500);
    transfer(writer, "move", everyday, wallet, "2100-09-21", 4000);
    const redeclaring = writerAt(changeLog, new Date(2100, 8, 22));
    redeclare(redeclaring, everyday, 90000);
    redeclare(redeclaring, everyday, 90000);

    expect(read(everyday)[0].endedAt).toEqual(
      accountBalance(changeLog.readAll(), everyday),
    );
    expect(read(wallet)[0].endedAt).toEqual(
      accountBalance(changeLog.readAll(), wallet),
    );
    expect(read()[0].endedAt).toEqual(accountsTotal(changeLog.readAll()));
  });

  it("counts an Adjustment as money in or out, and a Balance check as neither", () => {
    const { changeLog, everyday, read } = budget();
    const redeclaring = writerAt(changeLog, new Date(2100, 8, 22));
    redeclare(redeclaring, everyday, 94733);
    redeclare(redeclaring, everyday, 94733);
    redeclare(redeclaring, everyday, 95000);

    const [statement] = read(everyday);

    expect(statement.moneyIn).toEqual(usd(100267));
    expect(statement.moneyOut).toEqual(usd(5267));
    expect(statement.entries.map(({ kind }) => kind)).toEqual([
      "adjustment",
      "balance-check",
      "adjustment",
      "opening-balance",
    ]);
    expect(statement.entries[0]).toMatchObject({
      accountId: everyday,
      amount: usd(267),
      balance: usd(95000),
    });
    expect(statement.entries[1]).toMatchObject({
      accountId: everyday,
      balance: usd(94733),
    });
  });

  it("counts a Transfer as money in or out of one Account", () => {
    const { everyday, wallet, writer, read } = budget();
    transfer(writer, "move", everyday, wallet, "2100-10-04", 2000);

    expect(read(everyday)[0]).toMatchObject({
      moneyIn: usd(0),
      moneyOut: usd(2000),
      endedAt: usd(98000),
    });
    expect(read(wallet)[0]).toMatchObject({
      moneyIn: usd(2000),
      moneyOut: usd(0),
      endedAt: usd(7000),
    });
  });

  it("across every Account shows a Transfer once and counts it as neither in nor out", () => {
    const { everyday, wallet, writer, read } = budget();
    transfer(writer, "move", everyday, wallet, "2100-10-04", 2000);

    const [october, september] = read();

    expect(october).toMatchObject({
      month: "2100-10",
      moneyIn: usd(0),
      moneyOut: usd(0),
      endedAt: usd(105000),
    });
    expect(october.entries).toEqual([
      {
        kind: "transfer",
        id: "move",
        date: "2100-10-04",
        fromAccountId: everyday,
        toAccountId: wallet,
        amount: usd(2000),
      },
    ]);
    expect(september).toMatchObject({
      moneyIn: usd(105000),
      moneyOut: usd(0),
      endedAt: usd(105000),
    });
  });

  it("keeps a closed Account's history in Statements", () => {
    const { everyday, wallet, writer, read } = budget();
    transfer(writer, "move", wallet, everyday, "2100-10-04", 5000);
    writer.write<AccountClosed["type"], AccountClosed["payload"]>(
      wallet,
      "AccountClosed",
      { version: 1 },
    );

    expect(read(wallet).map(({ endedAt }) => endedAt)).toEqual([
      usd(0),
      usd(5000),
    ]);
  });

  it("leaves out what was deleted, and an Account's Statements leave out other Accounts", () => {
    const { everyday, wallet, record, read, writer } = budget();
    const deleted = record(everyday, "2100-10-01", 100);
    record(wallet, "2100-11-01", 100);
    deleteTransaction(writer, deleted);

    expect(read(everyday).map(({ month }) => month)).toEqual(["2100-09"]);
  });

  it("has no Statements before a Budget exists", () => {
    expect(statements(createInMemoryChangeLog().readAll())).toEqual([]);
  });
});
