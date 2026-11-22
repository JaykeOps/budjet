import { describe, expect, it } from "vitest";
import {
  type ChangeRecord,
  createDeviceChangeLog,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import {
  type AccountId,
  asId,
  type CategoryGroupId,
  type CategoryId,
  type TransactionId,
} from "../../kernel/id";
import { money } from "../../kernel/money";
import { seedRecord } from "../../kernel/seed-record";
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
import type { TransferDeleted, TransferMade } from "../transfers/records";
import {
  deleteTransaction,
  editTransaction,
  recordTransaction,
} from "./commands";
import { accountTransactions, payees, transactionList } from "./index";
import type { TransactionDeleted, TransactionEdited } from "./records";

const lunchId = asId<TransactionId>("lunch");

const lunch = lunchId;

const everyday = asId<CategoryGroupId>("everyday");

const groceriesId = asId<CategoryId>("groceries");
const rent = asId<CategoryId>("rent");

const checking = asId<AccountId>("checking");
const old = asId<AccountId>("old");
const savings = asId<AccountId>("savings");

/** A Budget in USD with one Account ("checking") and one Category ("groceries"). */
function budget() {
  const changeLog = createInMemoryChangeLog();
  const log = createDeviceChangeLog(changeLog, "this-device");
  seedRecord<BudgetCreated["type"], BudgetCreated["payload"]>(
    log,
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  seedRecord<AccountOpened["type"], AccountOpened["payload"]>(
    log,
    "checking",
    "AccountOpened",
    {
      version: 1,
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    },
  );
  seedRecord<CategoryGroupCreated["type"], CategoryGroupCreated["payload"]>(
    log,
    "everyday",
    "CategoryGroupCreated",
    { version: 1, name: "Everyday", position: 0 },
  );
  seedRecord<CategoryCreated["type"], CategoryCreated["payload"]>(
    log,
    "groceries",
    "CategoryCreated",
    {
      version: 1,
      name: "Groceries",
      groupId: everyday,
      position: 0,
    },
  );
  return {
    log,
    changeLog,
    transactions: () => accountTransactions(changeLog.readAll(), checking),
    /** Checking's list, without the Opening Balance every list ends with. */
    transactionList: () =>
      transactionList(changeLog.readAll(), checking).filter(
        ({ kind }) => kind !== "opening-balance",
      ),
    payees: () => payees(changeLog.readAll()),
  };
}

describe("Transactions", () => {
  it("refuses money going out without a Category", () => {
    const { log, transactions } = budget();

    expect(() =>
      recordTransaction(log, {
        accountId: checking,
        date: "2026-10-12",
        amount: money(-4550, "USD"),
      }),
    ).toThrow(/needs a Category/);
    expect(transactions()).toEqual([]);
  });

  it.each([
    [
      "an Account that doesn't exist",
      { accountId: savings },
      /No Account savings/,
    ],
    ["a Category that doesn't exist", { categoryId: rent }, /No Category rent/],
    [
      "an amount in another currency",
      { amount: money(-100, "EUR") },
      /in USD, the Budget's currency/,
    ],
    ["a date that isn't a calendar date", { date: "12/10/2026" }, /date/],
    ["no amount", { amount: money(0, "USD") }, /needs an amount/],
  ])("refuses %s", (_, change, error) => {
    const { log, transactions } = budget();

    expect(() =>
      recordTransaction(log, {
        accountId: checking,
        date: "2026-10-12",
        amount: money(-4550, "USD"),
        categoryId: groceriesId,
        ...change,
      }),
    ).toThrow(error);
    expect(transactions()).toEqual([]);
  });

  it("lists an Account's Transactions newest first, latest recorded first on the same date", () => {
    const { log, transactions } = budget();

    const groceries = recordTransaction(log, {
      accountId: checking,
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: groceriesId,
      payee: "Corner Shop",
      memo: "Milk and bread",
    });
    const salary = recordTransaction(log, {
      accountId: checking,
      date: "2026-10-25",
      amount: money(300000, "USD"),
      payee: "Employer",
    });
    const refund = recordTransaction(log, {
      accountId: checking,
      date: "2026-10-12",
      amount: money(1000, "USD"),
      categoryId: groceriesId,
    });
    const older = recordTransaction(log, {
      accountId: checking,
      date: "2026-09-30",
      amount: money(-200, "USD"),
      categoryId: groceriesId,
    });

    expect(transactions()).toEqual([
      {
        id: salary,
        accountId: checking,
        date: "2026-10-25",
        amount: money(300000, "USD"),
        payee: "Employer",
      },
      {
        id: refund,
        accountId: checking,
        date: "2026-10-12",
        amount: money(1000, "USD"),
        categoryId: groceriesId,
      },
      {
        id: groceries,
        accountId: checking,
        date: "2026-10-12",
        amount: money(-4550, "USD"),
        categoryId: groceriesId,
        payee: "Corner Shop",
        memo: "Milk and bread",
      },
      {
        id: older,
        accountId: checking,
        date: "2026-09-30",
        amount: money(-200, "USD"),
        categoryId: groceriesId,
      },
    ]);
  });

  it("edits a Transaction: the edit replaces what was recorded", () => {
    const { log, transactions } = budget();
    const id = recordTransaction(log, {
      accountId: checking,
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: groceriesId,
      payee: "Corner Shop",
      memo: "Milk",
    });

    editTransaction(log, id, {
      accountId: checking,
      date: "2026-09-30",
      amount: money(2000, "USD"),
      payee: "Employer",
    });

    expect(transactions()).toEqual([
      {
        id,
        accountId: checking,
        date: "2026-09-30",
        amount: money(2000, "USD"),
        payee: "Employer",
      },
    ]);
  });

  it("deletes a Transaction, after which it can't be edited or deleted again", () => {
    const { log, transactions } = budget();
    const kept = recordTransaction(log, {
      accountId: checking,
      date: "2026-10-01",
      amount: money(2000, "USD"),
    });
    const deleted = recordTransaction(log, {
      accountId: checking,
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: groceriesId,
    });

    deleteTransaction(log, deleted);

    expect(transactions().map(({ id }) => id)).toEqual([kept]);
    expect(() => deleteTransaction(log, deleted)).toThrow(
      `No Transaction ${deleted}`,
    );
    expect(() =>
      editTransaction(log, deleted, {
        accountId: checking,
        date: "2026-10-12",
        amount: money(-100, "USD"),
        categoryId: groceriesId,
      }),
    ).toThrow(`No Transaction ${deleted}`);
  });

  it("edits under the same rules as recording", () => {
    const { log, transactions } = budget();
    const id = recordTransaction(log, {
      accountId: checking,
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: groceriesId,
    });

    expect(() =>
      editTransaction(log, id, {
        accountId: checking,
        date: "2026-10-12",
        amount: money(-4550, "USD"),
      }),
    ).toThrow(/needs a Category/);
    expect(transactions()).toEqual([
      {
        id,
        accountId: checking,
        date: "2026-10-12",
        amount: money(-4550, "USD"),
        categoryId: groceriesId,
      },
    ]);
  });

  describe("when two devices change the same Transaction, the most recent change wins, unless it's deleted", () => {
    function edit(deviceId: string, wallTime: number): TransactionEdited {
      return {
        id: `edit-${deviceId}`,
        subjectId: lunch,
        deviceId,
        timestamp: { wallTime, counter: 0 },
        type: "TransactionEdited",
        payload: {
          version: 1,
          accountId: checking,
          date: "2026-10-12",
          amount: money(-1200, "USD"),
          categoryId: groceriesId,
          payee: `Edited on ${deviceId}`,
        },
      };
    }
    function deletion(deviceId: string, wallTime: number): TransactionDeleted {
      return {
        id: `delete-${deviceId}`,
        subjectId: lunch,
        deviceId,
        timestamp: { wallTime, counter: 0 },
        type: "TransactionDeleted",
        payload: { version: 1 },
      };
    }

    it.each<[string, ChangeRecord[], string[]]>([
      [
        "a deletion beats a later edit",
        [deletion("phone", 2_000), edit("laptop", 3_000)],
        [],
      ],
      [
        "a deletion beats an earlier edit",
        [edit("laptop", 2_000), deletion("phone", 3_000)],
        [],
      ],
      [
        "the later of two edits wins",
        [edit("laptop", 3_000), edit("phone", 2_000)],
        ["Edited on laptop"],
      ],
    ])("%s, whichever arrives first", (_, changes, payees) => {
      for (const order of [changes, [...changes].reverse()]) {
        const { changeLog, transactions } = budget();
        changeLog.append([
          {
            id: "recorded",
            subjectId: "lunch",
            deviceId: "this-device",
            timestamp: { wallTime: 1_000, counter: 0 },
            type: "TransactionRecorded",
            payload: {
              version: 1,
              accountId: checking,
              date: "2026-10-12",
              amount: money(-900, "USD"),
              categoryId: groceriesId,
            },
          },
        ]);
        for (const change of order) changeLog.append([change]);

        expect(transactions().map(({ payee }) => payee)).toEqual(payees);
      }
    });
  });

  it("keeps a closed Account's Transactions but takes no new ones, and no changes to them", () => {
    const { changeLog, log } = budget();
    seedRecord<AccountOpened["type"], AccountOpened["payload"]>(
      log,
      "old",
      "AccountOpened",
      {
        version: 1,
        name: "Old checking",
        kind: "checking",
        openingBalance: money(0, "USD"),
      },
    );
    const record = (accountId: AccountId, cents: number) =>
      recordTransaction(log, {
        accountId,
        date: "2026-10-12",
        amount: money(cents, "USD"),
        categoryId: groceriesId,
      });
    const refund = record(old, 1000);
    const spent = record(old, -1000);
    const inChecking = record(checking, -500);
    seedRecord<AccountClosed["type"], AccountClosed["payload"]>(
      log,
      "old",
      "AccountClosed",
      { version: 1 },
    );

    expect(() => record(old, -200)).toThrow("Old checking is closed");
    expect(() =>
      editTransaction(log, refund, {
        accountId: old,
        date: "2026-10-12",
        amount: money(2000, "USD"),
        categoryId: groceriesId,
      }),
    ).toThrow("Old checking is closed");
    expect(() =>
      editTransaction(log, spent, {
        accountId: checking,
        date: "2026-10-12",
        amount: money(-1000, "USD"),
        categoryId: groceriesId,
      }),
    ).toThrow("Old checking is closed");
    expect(() =>
      editTransaction(log, inChecking, {
        accountId: old,
        date: "2026-10-12",
        amount: money(-500, "USD"),
        categoryId: groceriesId,
      }),
    ).toThrow("Old checking is closed");
    expect(() => deleteTransaction(log, spent)).toThrow(
      "Old checking is closed",
    );
    expect(
      accountTransactions(changeLog.readAll(), old).map(({ id }) => id),
    ).toEqual([spent, refund]);
  });

  it("suggests each Payee used before once, in alphabetical order, from Transactions that still exist", () => {
    const { log, payees } = budget();
    const record = (payee: string) =>
      recordTransaction(log, {
        accountId: checking,
        date: "2026-10-12",
        amount: money(1000, "USD"),
        payee,
      });
    record("corner shop");
    record("Employer");
    record("Corner Shop");
    record("Employer");
    record("");
    deleteTransaction(log, record("Typo Mart"));
    const renamed = record("Bakry");
    editTransaction(log, renamed, {
      accountId: checking,
      date: "2026-10-12",
      amount: money(1000, "USD"),
      payee: "Bakery",
    });

    expect(payees()).toEqual([
      "Bakery",
      "corner shop",
      "Corner Shop",
      "Employer",
    ]);
  });

  it("lists an Account's Transfers among its Transactions", () => {
    const { log, transactionList } = budget();
    const transfer = (
      id: string,
      fromAccountId: AccountId,
      toAccountId: AccountId,
      date: string,
      cents: number,
    ) =>
      seedRecord<TransferMade["type"], TransferMade["payload"]>(
        log,
        id,
        "TransferMade",
        {
          version: 1,
          fromAccountId,
          toAccountId,
          date,
          amount: money(cents, "USD"),
          ...(id === "to-savings" && { memo: "Rainy day" }),
        },
      );
    transfer("to-savings", checking, savings, "2026-10-12", 20000);
    const groceries = recordTransaction(log, {
      accountId: checking,
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: groceriesId,
    });
    transfer("from-savings", savings, checking, "2026-10-20", 5000);
    transfer("deleted", checking, savings, "2026-10-21", 100);
    seedRecord<TransferDeleted["type"], TransferDeleted["payload"]>(
      log,
      "deleted",
      "TransferDeleted",
      { version: 1 },
    );

    expect(transactionList()).toEqual([
      {
        kind: "transfer",
        id: "from-savings",
        date: "2026-10-20",
        fromAccountId: savings,
        toAccountId: checking,
        amount: money(5000, "USD"),
      },
      {
        kind: "transaction",
        id: groceries,
        accountId: checking,
        date: "2026-10-12",
        amount: money(-4550, "USD"),
        categoryId: groceriesId,
      },
      {
        kind: "transfer",
        id: "to-savings",
        date: "2026-10-12",
        fromAccountId: checking,
        toAccountId: savings,
        amount: money(20000, "USD"),
        memo: "Rainy day",
      },
    ]);
  });

  it("lists an Account's Adjustments among its Transactions, on the day the balance was re-declared", () => {
    const { changeLog, log, transactionList } = budget();
    const groceries = recordTransaction(log, {
      accountId: checking,
      date: "2100-01-15",
      amount: money(-4550, "USD"),
      categoryId: groceriesId,
    });
    // A clock ahead of the records already written, which the Change Log keeps in order.
    const redeclared = seedRecord<
      BalanceRedeclared["type"],
      BalanceRedeclared["payload"]
    >(
      createDeviceChangeLog(changeLog, "this-device", {
        now: () => new Date(2100, 0, 14, 12).getTime(),
      }),
      "checking",
      "BalanceRedeclared",
      { version: 1, balance: money(95000, "USD") },
    );

    expect(transactionList()).toEqual([
      expect.objectContaining({ kind: "transaction", id: groceries }),
      {
        kind: "adjustment",
        id: redeclared.id,
        accountId: checking,
        date: "2100-01-14",
        amount: money(-450, "USD"),
        balance: money(95000, "USD"),
      },
    ]);
  });

  it("lists re-declaring the current balance as a Balance check, not an Adjustment", () => {
    const { changeLog, transactionList } = budget();
    const checked = seedRecord<
      BalanceRedeclared["type"],
      BalanceRedeclared["payload"]
    >(
      createDeviceChangeLog(changeLog, "this-device", {
        now: () => new Date(2100, 0, 14, 12).getTime(),
      }),
      "checking",
      "BalanceRedeclared",
      { version: 1, balance: money(100000, "USD") },
    );

    expect(transactionList()).toEqual([
      {
        kind: "balance-check",
        id: checked.id,
        accountId: checking,
        date: "2100-01-14",
        balance: money(100000, "USD"),
      },
    ]);
  });
});
