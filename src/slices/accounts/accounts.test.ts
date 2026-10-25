import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { BudgetCreated } from "../budget-setup/records";
import type { TransactionRecorded } from "../transactions/records";
import { openAccount } from "./commands";
import { accountBalance, accounts, accountsTotal } from "./index";

function budgetIn(currency: string) {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, "this-device");
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency },
  );
  return { changeLog, writer };
}

describe("Accounts", () => {
  it("lists an opened Account, open, with its Opening Balance as its balance", () => {
    const { changeLog, writer } = budgetIn("USD");

    const id = openAccount(writer, {
      name: "Everyday checking",
      kind: "checking",
      openingBalance: money(125050, "USD"),
    });

    expect(accounts(changeLog.readAll())).toEqual([
      {
        id,
        name: "Everyday checking",
        kind: "checking",
        closed: false,
        balance: money(125050, "USD"),
      },
    ]);
    expect(accountBalance(changeLog.readAll(), id)).toEqual(
      money(125050, "USD"),
    );
  });

  it("totals the balances of every Account, savings and cash included", () => {
    const { changeLog, writer } = budgetIn("SEK");
    expect(accountsTotal(changeLog.readAll())).toEqual(money(0, "SEK"));

    openAccount(writer, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "SEK"),
    });
    openAccount(writer, {
      name: "Rainy day",
      kind: "savings",
      openingBalance: money(250000, "SEK"),
    });
    openAccount(writer, {
      name: "Wallet",
      kind: "cash",
      openingBalance: money(-5050, "SEK"),
    });

    expect(accounts(changeLog.readAll()).map(({ name }) => name)).toEqual([
      "Checking",
      "Rainy day",
      "Wallet",
    ]);
    expect(accountsTotal(changeLog.readAll())).toEqual(money(344950, "SEK"));
  });

  it("counts money going out of and coming in to an Account in its balance", () => {
    const { changeLog, writer } = budgetIn("USD");
    const checking = openAccount(writer, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });
    const savings = openAccount(writer, {
      name: "Savings",
      kind: "savings",
      openingBalance: money(50000, "USD"),
    });
    const recordTransaction = (accountId: string, amount: number) =>
      writer.write<TransactionRecorded["type"], TransactionRecorded["payload"]>(
        crypto.randomUUID(),
        "TransactionRecorded",
        {
          version: 1,
          accountId,
          date: "2026-10-12",
          amount: money(amount, "USD"),
          categoryId: "groceries",
        },
      );

    recordTransaction(checking, -4550);
    recordTransaction(checking, 300000);
    recordTransaction(savings, -1000);

    expect(accountBalance(changeLog.readAll(), checking)).toEqual(
      money(395450, "USD"),
    );
    expect(accountBalance(changeLog.readAll(), savings)).toEqual(
      money(49000, "USD"),
    );
    expect(accountsTotal(changeLog.readAll())).toEqual(money(444450, "USD"));
  });

  it("needs a name for the Account", () => {
    const { changeLog, writer } = budgetIn("USD");

    expect(() =>
      openAccount(writer, {
        name: "   ",
        kind: "checking",
        openingBalance: money(0, "USD"),
      }),
    ).toThrow(/needs a name/);
    expect(accounts(changeLog.readAll())).toEqual([]);
  });

  it("keeps the Opening Balance in the Budget's currency", () => {
    const { changeLog, writer } = budgetIn("USD");

    expect(() =>
      openAccount(writer, {
        name: "Euro account",
        kind: "checking",
        openingBalance: money(1000, "EUR"),
      }),
    ).toThrow(/in USD, the Budget's currency/);
    expect(accounts(changeLog.readAll())).toEqual([]);
  });

  it("opens Accounts only once a Budget exists", () => {
    const changeLog = createInMemoryChangeLog();
    const writer = createChangeLogWriter(changeLog, "this-device");

    expect(() =>
      openAccount(writer, {
        name: "Checking",
        kind: "checking",
        openingBalance: money(0, "USD"),
      }),
    ).toThrow(/Create a Budget first/);
  });
});
