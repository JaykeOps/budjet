import { describe, expect, it } from "vitest";
import {
  type ChangeLog,
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
import {
  accountBalance,
  accounts,
  accountsTotal,
  adjustments,
  balanceChecks,
} from "./index";
import type { BalanceRedeclared } from "./records";

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

/** A second device writing to the same Change Log, with its clock reading `at`. */
function deviceAt(changeLog: ChangeLog, deviceId: string, at: Date) {
  return createChangeLogWriter(changeLog, deviceId, {
    now: () => at.getTime(),
  });
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

  it("keeps re-declaring the current balance as a Balance check, not an Adjustment", () => {
    const { changeLog, writer } = budgetIn("USD");
    const checking = openAccount(writer, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });

    const checked = deviceAt(
      changeLog,
      "this-device",
      new Date(2100, 9, 18, 12),
    ).write<BalanceRedeclared["type"], BalanceRedeclared["payload"]>(
      checking,
      "BalanceRedeclared",
      { version: 1, balance: money(100000, "USD") },
    );

    expect(balanceChecks(changeLog.readAll())).toEqual([
      {
        id: checked.id,
        accountId: checking,
        date: "2100-10-18",
        balance: money(100000, "USD"),
      },
    ]);
    expect(adjustments(changeLog.readAll())).toEqual([]);
    expect(accountBalance(changeLog.readAll(), checking)).toEqual(
      money(100000, "USD"),
    );
  });

  it("measures a Balance check against the balance just before it, once a late record arrives from another device", () => {
    const { changeLog, writer } = budgetIn("USD");
    const checking = openAccount(writer, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });
    // Both devices saw $1,000. This one checks it on Oct 20; the other spent
    // $10 on Oct 19 but its record only arrives afterwards.
    const other = createChangeLogWriter(createInMemoryChangeLog(), "other", {
      now: () => new Date(2100, 9, 19, 12).getTime(),
    });
    const spent = other.write<
      TransactionRecorded["type"],
      TransactionRecorded["payload"]
    >("late", "TransactionRecorded", {
      version: 1,
      accountId: checking,
      date: "2100-10-19",
      amount: money(-1000, "USD"),
      categoryId: "groceries",
    });
    const check = deviceAt(
      changeLog,
      "this-device",
      new Date(2100, 9, 20, 12),
    ).write<BalanceRedeclared["type"], BalanceRedeclared["payload"]>(
      checking,
      "BalanceRedeclared",
      { version: 1, balance: money(100000, "USD") },
    );
    expect(balanceChecks(changeLog.readAll())).toHaveLength(1);

    changeLog.append([spent]);

    // Now it declares $10 more than the $990 just before it.
    expect(balanceChecks(changeLog.readAll())).toEqual([]);
    expect(adjustments(changeLog.readAll())).toEqual([
      {
        id: check.id,
        accountId: checking,
        date: "2100-10-20",
        amount: money(1000, "USD"),
      },
    ]);
    expect(accounts(changeLog.readAll())[0].lastChecked).toBe("2100-10-20");
  });

  describe("last checked", () => {
    function checkingAccount() {
      const { changeLog, writer } = budgetIn("USD");
      const checking = openAccount(writer, {
        name: "Checking",
        kind: "checking",
        openingBalance: money(100000, "USD"),
      });
      const lastChecked = () =>
        accounts(changeLog.readAll()).find(({ id }) => id === checking)
          ?.lastChecked;
      return { changeLog, checking, lastChecked };
    }

    function redeclareOn(
      changeLog: ChangeLog,
      deviceId: string,
      accountId: string,
      at: Date,
      minorUnits: number,
    ) {
      return deviceAt(changeLog, deviceId, at).write<
        BalanceRedeclared["type"],
        BalanceRedeclared["payload"]
      >(accountId, "BalanceRedeclared", {
        version: 1,
        balance: money(minorUnits, "USD"),
      });
    }

    it("doesn't count adding an Account", () => {
      expect(checkingAccount().lastChecked()).toBeUndefined();
    });

    it("is the date of a Balance check", () => {
      const { changeLog, checking, lastChecked } = checkingAccount();

      redeclareOn(changeLog, "a", checking, new Date(2100, 9, 18, 12), 100000);

      expect(lastChecked()).toBe("2100-10-18");
    });

    it("is the date of an Adjustment when that came after a Balance check", () => {
      const { changeLog, checking, lastChecked } = checkingAccount();

      redeclareOn(changeLog, "a", checking, new Date(2100, 9, 18, 12), 100000);
      redeclareOn(changeLog, "a", checking, new Date(2100, 9, 20, 12), 90000);

      expect(lastChecked()).toBe("2100-10-20");
    });

    it("is the date of a Balance check when that came after an Adjustment", () => {
      const { changeLog, checking, lastChecked } = checkingAccount();

      redeclareOn(changeLog, "a", checking, new Date(2100, 9, 18, 12), 90000);
      redeclareOn(changeLog, "a", checking, new Date(2100, 9, 20, 12), 90000);

      expect(lastChecked()).toBe("2100-10-20");
    });

    it("isn't changed by a Transaction", () => {
      const { changeLog, checking, lastChecked } = checkingAccount();
      redeclareOn(changeLog, "a", checking, new Date(2100, 9, 18, 12), 100000);

      deviceAt(changeLog, "a", new Date(2100, 9, 20, 12)).write<
        TransactionRecorded["type"],
        TransactionRecorded["payload"]
      >("spent", "TransactionRecorded", {
        version: 1,
        accountId: checking,
        date: "2100-10-20",
        amount: money(-1000, "USD"),
        categoryId: "groceries",
      });

      expect(lastChecked()).toBe("2100-10-18");
    });

    it("belongs to the one Account", () => {
      const { changeLog, writer } = budgetIn("USD");
      const first = openAccount(writer, {
        name: "First",
        kind: "checking",
        openingBalance: money(0, "USD"),
      });
      const second = openAccount(writer, {
        name: "Second",
        kind: "savings",
        openingBalance: money(0, "USD"),
      });

      redeclareOn(changeLog, "a", first, new Date(2100, 9, 18, 12), 0);

      const byId = new Map(
        accounts(changeLog.readAll()).map((account) => [account.id, account]),
      );
      expect(byId.get(first)?.lastChecked).toBe("2100-10-18");
      expect(byId.get(second)?.lastChecked).toBeUndefined();
    });

    it("is the same whichever order two devices' records arrive in", () => {
      const write = (order: "older first" | "newer first") => {
        const { changeLog, checking, lastChecked } = checkingAccount();
        const offline = createInMemoryChangeLog();
        const older = redeclareOn(
          offline,
          "a",
          checking,
          new Date(2100, 9, 18, 12),
          100000,
        );
        const newer = redeclareOn(
          offline,
          "b",
          checking,
          new Date(2100, 9, 20, 12),
          100000,
        );
        changeLog.append(order === "older first" ? [older] : [newer]);
        changeLog.append(order === "older first" ? [newer] : [older]);
        return lastChecked();
      };

      expect(write("older first")).toBe("2100-10-20");
      expect(write("newer first")).toBe("2100-10-20");
    });

    it("follows the Change Log, not the clock, when a device's clock is behind one it has seen", () => {
      const { changeLog, checking, lastChecked } = checkingAccount();

      redeclareOn(
        changeLog,
        "fast",
        checking,
        new Date(2100, 9, 20, 12),
        100000,
      );
      // Written a moment later on a device whose clock says Oct 18: the hybrid
      // logical clock stamps it after the record it has seen.
      const later = redeclareOn(
        changeLog,
        "slow",
        checking,
        new Date(2100, 9, 18, 12),
        90000,
      );

      expect(changeLog.readAll().at(-1)?.id).toBe(later.id);
      expect(lastChecked()).toBe("2100-10-20");
      expect(accountBalance(changeLog.readAll(), checking)).toEqual(
        money(90000, "USD"),
      );
    });
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
        lastChecked: expect.any(String),
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
