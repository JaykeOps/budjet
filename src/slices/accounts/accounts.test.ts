import { describe, expect, it } from "vitest";
import {
  type ChangeLog,
  createDeviceChangeLog,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { type AccountId, asId } from "../../kernel/id";
import { money } from "../../kernel/money";
import { seedRecord } from "../../kernel/seed-record";
import type { BudgetCreated } from "../budget-setup/records";
import type {
  TransactionDeleted,
  TransactionEdited,
  TransactionRecorded,
} from "../transactions/records";
import {
  closeAccount,
  deleteRedeclaredBalance,
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
import type { BalanceRedeclared, RedeclaredBalanceDeleted } from "./records";

function budgetIn(currency: string) {
  const changeLog = createInMemoryChangeLog();
  const log = createDeviceChangeLog(changeLog, "this-device");
  seedRecord<BudgetCreated["type"], BudgetCreated["payload"]>(
    log,
    "budget",
    "BudgetCreated",
    { version: 1, currency },
  );
  return { changeLog, log };
}

/** A second device writing to the same Change Log, with its clock reading `at`. */
function deviceAt(changeLog: ChangeLog, deviceId: string, at: Date) {
  return createDeviceChangeLog(changeLog, deviceId, {
    now: () => at.getTime(),
  });
}

/** A re-declaration written on a device whose clock reads `at`. */
function redeclareOn(
  changeLog: ChangeLog,
  deviceId: string,
  accountId: AccountId,
  at: Date,
  minorUnits: number,
) {
  return seedRecord<BalanceRedeclared["type"], BalanceRedeclared["payload"]>(
    deviceAt(changeLog, deviceId, at),
    accountId,
    "BalanceRedeclared",
    {
      version: 1,
      balance: money(minorUnits, "USD"),
    },
  );
}

describe("Accounts", () => {
  it("lists an opened Account, open, with its Opening Balance as its balance", () => {
    const { changeLog, log } = budgetIn("USD");

    const id = openAccount(log, {
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
    const { changeLog, log } = budgetIn("SEK");
    expect(accountsTotal(changeLog.readAll())).toEqual(money(0, "SEK"));

    openAccount(log, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "SEK"),
    });
    openAccount(log, {
      name: "Rainy day",
      kind: "savings",
      openingBalance: money(250000, "SEK"),
    });
    openAccount(log, {
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
    const { changeLog, log } = budgetIn("USD");
    const checking = openAccount(log, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });
    const savings = openAccount(log, {
      name: "Savings",
      kind: "savings",
      openingBalance: money(50000, "USD"),
    });
    const recordTransaction = (accountId: AccountId, amount: number) =>
      seedRecord<TransactionRecorded["type"], TransactionRecorded["payload"]>(
        log,
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
    const { changeLog, log } = budgetIn("USD");
    const checking = openAccount(log, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });
    const savings = openAccount(log, {
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
    seedRecord<TransactionRecorded["type"], TransactionRecorded["payload"]>(
      log,
      "moved",
      "TransactionRecorded",
      transaction,
    );
    seedRecord<TransactionRecorded["type"], TransactionRecorded["payload"]>(
      log,
      "deleted",
      "TransactionRecorded",
      transaction,
    );

    seedRecord<TransactionEdited["type"], TransactionEdited["payload"]>(
      log,
      "moved",
      "TransactionEdited",
      { ...transaction, accountId: savings, amount: money(-1000, "USD") },
    );
    seedRecord<TransactionDeleted["type"], TransactionDeleted["payload"]>(
      log,
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
    const { changeLog, log } = budgetIn("USD");
    const checking = openAccount(log, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });

    redeclareBalance(log, checking, { balance: money(112500, "USD") });
    expect(accountBalance(changeLog.readAll(), checking)).toEqual(
      money(112500, "USD"),
    );

    redeclareBalance(log, checking, { balance: money(90000, "USD") });
    expect(accountBalance(changeLog.readAll(), checking)).toEqual(
      money(90000, "USD"),
    );
  });

  it("keeps re-declaring the current balance as a Balance check, not an Adjustment", () => {
    const { changeLog, log } = budgetIn("USD");
    const checking = openAccount(log, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });

    const checked = seedRecord<
      BalanceRedeclared["type"],
      BalanceRedeclared["payload"]
    >(
      deviceAt(changeLog, "this-device", new Date(2100, 9, 18, 12)),
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
    const { changeLog, log } = budgetIn("USD");
    const checking = openAccount(log, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    });
    // Both devices saw $1,000. This one checks it on Oct 20; the other spent
    // $10 on Oct 19 but its record only arrives afterwards.
    const other = createDeviceChangeLog(createInMemoryChangeLog(), "other", {
      now: () => new Date(2100, 9, 19, 12).getTime(),
    });
    const spent = seedRecord<
      TransactionRecorded["type"],
      TransactionRecorded["payload"]
    >(other, "late", "TransactionRecorded", {
      version: 1,
      accountId: checking,
      date: "2100-10-19",
      amount: money(-1000, "USD"),
      categoryId: "groceries",
    });
    const check = seedRecord<
      BalanceRedeclared["type"],
      BalanceRedeclared["payload"]
    >(
      deviceAt(changeLog, "this-device", new Date(2100, 9, 20, 12)),
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
        balance: money(100000, "USD"),
      },
    ]);
    expect(accounts(changeLog.readAll())[0].lastChecked).toBe("2100-10-20");
  });

  describe("last checked", () => {
    function checkingAccount() {
      const { changeLog, log } = budgetIn("USD");
      const checking = openAccount(log, {
        name: "Checking",
        kind: "checking",
        openingBalance: money(100000, "USD"),
      });
      const lastChecked = () =>
        accounts(changeLog.readAll()).find(({ id }) => id === checking)
          ?.lastChecked;
      return { changeLog, checking, lastChecked };
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

      seedRecord<TransactionRecorded["type"], TransactionRecorded["payload"]>(
        deviceAt(changeLog, "a", new Date(2100, 9, 20, 12)),
        "spent",
        "TransactionRecorded",
        {
          version: 1,
          accountId: checking,
          date: "2100-10-20",
          amount: money(-1000, "USD"),
          categoryId: "groceries",
        },
      );

      expect(lastChecked()).toBe("2100-10-18");
    });

    it("belongs to the one Account", () => {
      const { changeLog, log } = budgetIn("USD");
      const first = openAccount(log, {
        name: "First",
        kind: "checking",
        openingBalance: money(0, "USD"),
      });
      const second = openAccount(log, {
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

  describe("deleting a re-declared balance", () => {
    function checkingAccount() {
      const { changeLog, log } = budgetIn("USD");
      const checking = openAccount(log, {
        name: "Checking",
        kind: "checking",
        openingBalance: money(100000, "USD"),
      });
      const account = () =>
        accounts(changeLog.readAll()).find(({ id }) => id === checking);
      /** A re-declaration on a day in October 2100. */
      const redeclare = (day: number, minorUnits: number) =>
        redeclareOn(
          changeLog,
          "a",
          checking,
          new Date(2100, 9, day, 12),
          minorUnits,
        );
      const openingRecord = () =>
        changeLog.readAll().find(({ type }) => type === "AccountOpened")?.id ??
        "";
      return { changeLog, log, checking, account, redeclare, openingRecord };
    }

    /** A deletion written on a device whose clock reads `at`. */
    function deleteOn(
      changeLog: ChangeLog,
      deviceId: string,
      recordId: string,
      at: Date,
    ) {
      return seedRecord<
        RedeclaredBalanceDeleted["type"],
        RedeclaredBalanceDeleted["payload"]
      >(
        deviceAt(changeLog, deviceId, at),
        recordId,
        "RedeclaredBalanceDeleted",
        { version: 1 },
      );
    }

    it("takes an Adjustment back out of the Account", () => {
      const { changeLog, log, account, redeclare } = checkingAccount();
      const redeclared = redeclare(18, 90000);

      deleteRedeclaredBalance(log, redeclared.id);

      expect(adjustments(changeLog.readAll())).toEqual([]);
      expect(account()?.balance).toEqual(money(100000, "USD"));
    });

    it("takes back a re-declaration by the id redeclaring returned", () => {
      const { changeLog, log, checking, account } = checkingAccount();

      const id = redeclareBalance(log, checking, {
        balance: money(90000, "USD"),
      });
      deleteRedeclaredBalance(log, id);

      expect(adjustments(changeLog.readAll())).toEqual([]);
      expect(account()?.balance).toEqual(money(100000, "USD"));
    });

    it("removes a Balance check, moving nothing", () => {
      const { changeLog, log, account, redeclare } = checkingAccount();
      const check = redeclare(18, 100000);

      deleteRedeclaredBalance(log, check.id);

      expect(balanceChecks(changeLog.readAll())).toEqual([]);
      expect(account()?.balance).toEqual(money(100000, "USD"));
    });

    it("measures later Adjustments again from the balance just before them", () => {
      const { changeLog, log, checking, account, redeclare } =
        checkingAccount();
      const first = redeclare(18, 90000);
      const second = redeclare(20, 95000);

      deleteRedeclaredBalance(log, first.id);

      expect(adjustments(changeLog.readAll())).toEqual([
        {
          id: second.id,
          accountId: checking,
          date: "2100-10-20",
          amount: money(-5000, "USD"),
          balance: money(95000, "USD"),
        },
      ]);
      expect(account()?.balance).toEqual(money(95000, "USD"));
    });

    it("turns a later Balance check into an Adjustment when the balance it matched is deleted", () => {
      const { changeLog, log, checking, redeclare } = checkingAccount();
      const first = redeclare(18, 90000);
      const check = redeclare(20, 90000);

      deleteRedeclaredBalance(log, first.id);

      expect(balanceChecks(changeLog.readAll())).toEqual([]);
      expect(adjustments(changeLog.readAll())).toEqual([
        {
          id: check.id,
          accountId: checking,
          date: "2100-10-20",
          amount: money(-10000, "USD"),
          balance: money(90000, "USD"),
        },
      ]);
    });

    it("sets last checked back to the re-declaration before it, or to none", () => {
      const { log, account, redeclare } = checkingAccount();
      const first = redeclare(18, 100000);
      const second = redeclare(20, 90000);

      deleteRedeclaredBalance(log, second.id);
      expect(account()?.lastChecked).toBe("2100-10-18");

      deleteRedeclaredBalance(log, first.id);
      expect(account()?.lastChecked).toBeUndefined();
    });

    it.each(["re-declaration first", "deletion first"])(
      "gives the same result when the %s arrives",
      (order) => {
        const { changeLog, checking, account } = checkingAccount();
        const offline = createInMemoryChangeLog();
        const at = new Date(2100, 9, 18, 12);
        const redeclared = redeclareOn(offline, "a", checking, at, 90000);
        const deletion = deleteOn(offline, "b", redeclared.id, at);

        changeLog.append([order === "deletion first" ? deletion : redeclared]);
        changeLog.append([order === "deletion first" ? redeclared : deletion]);

        expect(account()?.balance).toEqual(money(100000, "USD"));
        expect(account()?.lastChecked).toBeUndefined();
        expect(adjustments(changeLog.readAll())).toEqual([]);
      },
    );

    it("still wins when a skewed clock stamps the deletion before the re-declaration", () => {
      const { changeLog, checking, account } = checkingAccount();
      const redeclared = redeclareOn(
        createInMemoryChangeLog(),
        "fast",
        checking,
        new Date(2100, 9, 20, 12),
        90000,
      );
      const deletion = deleteOn(
        createInMemoryChangeLog(),
        "slow",
        redeclared.id,
        new Date(2100, 9, 18, 12),
      );

      changeLog.append([redeclared, deletion]);

      expect(changeLog.readAll().at(-1)?.id).toBe(redeclared.id);
      expect(account()?.balance).toEqual(money(100000, "USD"));
      expect(account()?.lastChecked).toBeUndefined();
      expect(adjustments(changeLog.readAll())).toEqual([]);
    });

    it("works from a device whose clock is behind the re-declaration", () => {
      const { changeLog, account, redeclare } = checkingAccount();
      const redeclared = redeclare(20, 90000);

      deleteRedeclaredBalance(
        deviceAt(changeLog, "slow", new Date(2100, 9, 18, 12)),
        redeclared.id,
      );

      expect(account()?.balance).toEqual(money(100000, "USD"));
    });

    it("can't delete an Opening Balance", () => {
      const { log, checking, account, openingRecord } = checkingAccount();

      for (const id of [openingRecord(), checking]) {
        expect(() => deleteRedeclaredBalance(log, id)).toThrow(RangeError);
      }
      expect(account()?.balance).toEqual(money(100000, "USD"));
    });

    it("leaves an Opening Balance alone when a deletion names its record anyway", () => {
      const { changeLog, account, openingRecord } = checkingAccount();

      deleteOn(changeLog, "b", openingRecord(), new Date(2100, 9, 18, 12));

      expect(account()?.balance).toEqual(money(100000, "USD"));
    });

    it("can't delete the same re-declaration twice", () => {
      const { log, redeclare } = checkingAccount();
      const redeclared = redeclare(18, 90000);

      deleteRedeclaredBalance(log, redeclared.id);

      expect(() => deleteRedeclaredBalance(log, redeclared.id)).toThrow(
        RangeError,
      );
    });

    it("can't delete one in a closed Account, so its balance stays zero", () => {
      const { log, checking, account, redeclare } = checkingAccount();
      const redeclared = redeclare(18, 0);
      closeAccount(log, checking);

      expect(() => deleteRedeclaredBalance(log, redeclared.id)).toThrow(
        "Checking is closed",
      );
      expect(account()?.balance).toEqual(money(0, "USD"));
    });
  });

  it("renames an Account, the latest name winning", () => {
    const { changeLog, log } = budgetIn("USD");
    const id = openAccount(log, {
      name: "Checking",
      kind: "checking",
      openingBalance: money(0, "USD"),
    });

    renameAccount(log, id, { name: "  Bills account " });
    expect(accounts(changeLog.readAll()).map(({ name }) => name)).toEqual([
      "Bills account",
    ]);
    renameAccount(log, id, { name: "Everyday" });
    expect(accounts(changeLog.readAll()).map(({ name }) => name)).toEqual([
      "Everyday",
    ]);

    expect(() => renameAccount(log, id, { name: " " })).toThrow(/needs a name/);
    expect(() =>
      renameAccount(log, asId<AccountId>("missing"), { name: "X" }),
    ).toThrow(/No Account missing/);
  });

  it("closes an Account only once its balance is zero, pointing to Transfers", () => {
    const { changeLog, log } = budgetIn("USD");
    const id = openAccount(log, {
      name: "Old savings",
      kind: "savings",
      openingBalance: money(5000, "USD"),
    });

    expect(() => closeAccount(log, id)).toThrow(
      /Transfer the \$50\.00 in Old savings to another Account first/,
    );
    expect(accounts(changeLog.readAll())[0].closed).toBe(false);

    redeclareBalance(log, id, { balance: money(0, "USD") });
    closeAccount(log, id);

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
    expect(() => closeAccount(log, id)).toThrow(/Old savings is closed/);
    expect(() =>
      redeclareBalance(log, id, { balance: money(100, "USD") }),
    ).toThrow(/Old savings is closed/);
  });

  it("needs a name for the Account", () => {
    const { changeLog, log } = budgetIn("USD");

    expect(() =>
      openAccount(log, {
        name: "   ",
        kind: "checking",
        openingBalance: money(0, "USD"),
      }),
    ).toThrow(/needs a name/);
    expect(accounts(changeLog.readAll())).toEqual([]);
  });

  it("keeps the Opening Balance in the Budget's currency", () => {
    const { changeLog, log } = budgetIn("USD");

    expect(() =>
      openAccount(log, {
        name: "Euro account",
        kind: "checking",
        openingBalance: money(1000, "EUR"),
      }),
    ).toThrow(/in USD, the Budget's currency/);
    expect(accounts(changeLog.readAll())).toEqual([]);
  });

  it("opens Accounts only once a Budget exists", () => {
    const changeLog = createInMemoryChangeLog();
    const log = createDeviceChangeLog(changeLog, "this-device");

    expect(() =>
      openAccount(log, {
        name: "Checking",
        kind: "checking",
        openingBalance: money(0, "USD"),
      }),
    ).toThrow(/Create a Budget first/);
  });
});
