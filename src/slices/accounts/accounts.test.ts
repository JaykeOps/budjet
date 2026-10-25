import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { BudgetCreated } from "../budget-setup/records";
import type {
  TransactionDeleted,
  TransactionEdited,
  TransactionRecorded,
} from "../transactions/records";
import {
  closeAccount,
  openAccount,
  redeclareBalance,
  renameAccount,
} from "./commands";
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

  it("counts a Transaction as last edited, in whichever Account it now belongs to, and not at all once deleted", () => {
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
    const transaction = {
      version: 1 as const,
      accountId: checking,
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: "groceries",
    };
    writer.write<TransactionRecorded["type"], TransactionRecorded["payload"]>(
      "moved",
      "TransactionRecorded",
      transaction,
    );
    writer.write<TransactionRecorded["type"], TransactionRecorded["payload"]>(
      "deleted",
      "TransactionRecorded",
      transaction,
    );

    writer.write<TransactionEdited["type"], TransactionEdited["payload"]>(
      "moved",
      "TransactionEdited",
      { ...transaction, accountId: savings, amount: money(-1000, "USD") },
    );
    writer.write<TransactionDeleted["type"], TransactionDeleted["payload"]>(
      "deleted",
      "TransactionDeleted",
      { version: 1 },
    );

    expect(accountBalance(changeLog.readAll(), checking)).toEqual(
      money(100000, "USD"),
    );
    expect(accountBalance(changeLog.readAll(), savings)).toEqual(
      money(49000, "USD"),
    );
  });

  it("re-declares a balance higher or lower, so the balance becomes the declared one", () => {
    const { changeLog, writer } = budgetIn("USD");
    const checking = openAccount(writer, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });

    redeclareBalance(writer, checking, { balance: money(112500, "USD") });
    expect(accountBalance(changeLog.readAll(), checking)).toEqual(
      money(112500, "USD"),
    );

    redeclareBalance(writer, checking, { balance: money(90000, "USD") });
    expect(accountBalance(changeLog.readAll(), checking)).toEqual(
      money(90000, "USD"),
    );
  });

  it("renames an Account, the latest name winning", () => {
    const { changeLog, writer } = budgetIn("USD");
    const id = openAccount(writer, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(0, "USD"),
    });

    renameAccount(writer, id, { name: "  Bills account " });
    expect(accounts(changeLog.readAll()).map(({ name }) => name)).toEqual([
      "Bills account",
    ]);
    renameAccount(writer, id, { name: "Everyday" });
    expect(accounts(changeLog.readAll()).map(({ name }) => name)).toEqual([
      "Everyday",
    ]);

    expect(() => renameAccount(writer, id, { name: " " })).toThrow(
      /needs a name/,
    );
    expect(() => renameAccount(writer, "missing", { name: "X" })).toThrow(
      /No Account missing/,
    );
  });

  it("closes an Account only once its balance is zero, pointing to Transfers", () => {
    const { changeLog, writer } = budgetIn("USD");
    const id = openAccount(writer, {
      name: "Old savings",
      kind: "savings",
      openingBalance: money(5000, "USD"),
    });

    expect(() => closeAccount(writer, id)).toThrow(
      /Transfer the \$50\.00 in Old savings to another Account first/,
    );
    expect(accounts(changeLog.readAll())[0].closed).toBe(false);

    redeclareBalance(writer, id, { balance: money(0, "USD") });
    closeAccount(writer, id);

    expect(accounts(changeLog.readAll())).toEqual([
      {
        id,
        name: "Old savings",
        kind: "savings",
        closed: true,
        balance: money(0, "USD"),
      },
    ]);
    expect(() => closeAccount(writer, id)).toThrow(/Old savings is closed/);
    expect(() =>
      redeclareBalance(writer, id, { balance: money(100, "USD") }),
    ).toThrow(/Old savings is closed/);
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
