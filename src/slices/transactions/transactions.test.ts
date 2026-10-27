import { describe, expect, it } from "vitest";
import {
  type ChangeRecord,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
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
import { accountTransactionList, accountTransactions, payees } from "./index";
import type { TransactionDeleted, TransactionEdited } from "./records";

/** A Budget in USD with one Account ("checking") and one Category ("groceries"). */
function budget() {
  const changeLog = createInMemoryChangeLog();
  const writer = createChangeLogWriter(changeLog, "this-device");
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  writer.write<AccountOpened["type"], AccountOpened["payload"]>(
    "checking",
    "AccountOpened",
    {
      version: 1,
      name: "Checking",
      kind: "checking",
      openingBalance: money(100000, "USD"),
    },
  );
  writer.write<CategoryGroupCreated["type"], CategoryGroupCreated["payload"]>(
    "everyday",
    "CategoryGroupCreated",
    { version: 1, name: "Everyday", position: 0 },
  );
  writer.write<CategoryCreated["type"], CategoryCreated["payload"]>(
    "groceries",
    "CategoryCreated",
    { version: 1, name: "Groceries", groupId: "everyday", position: 0 },
  );
  return {
    writer,
    changeLog,
    transactions: () => accountTransactions(changeLog.readAll(), "checking"),
    transactionList: () =>
      accountTransactionList(changeLog.readAll(), "checking"),
    payees: () => payees(changeLog.readAll()),
  };
}

describe("Transactions", () => {
  it("refuses money going out without a Category", () => {
    const { writer, transactions } = budget();

    expect(() =>
      recordTransaction(writer, {
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-4550, "USD"),
      }),
    ).toThrow(/needs a Category/);
    expect(transactions()).toEqual([]);
  });

  it.each([
    [
      "an Account that doesn't exist",
      { accountId: "savings" },
      /No Account savings/,
    ],
    [
      "a Category that doesn't exist",
      { categoryId: "rent" },
      /No Category rent/,
    ],
    [
      "an amount in another currency",
      { amount: money(-100, "EUR") },
      /in USD, the Budget's currency/,
    ],
    ["a date that isn't a calendar date", { date: "12/10/2026" }, /date/],
    ["no amount", { amount: money(0, "USD") }, /needs an amount/],
  ])("refuses %s", (_, change, error) => {
    const { writer, transactions } = budget();

    expect(() =>
      recordTransaction(writer, {
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-4550, "USD"),
        categoryId: "groceries",
        ...change,
      }),
    ).toThrow(error);
    expect(transactions()).toEqual([]);
  });

  it("lists an Account's Transactions newest first, latest recorded first on the same date", () => {
    const { writer, transactions } = budget();

    const groceries = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: "groceries",
      payee: "Corner Shop",
      memo: "Milk and bread",
    });
    const salary = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-10-25",
      amount: money(300000, "USD"),
      payee: "Employer",
    });
    const refund = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-10-12",
      amount: money(1000, "USD"),
      categoryId: "groceries",
    });
    const older = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-09-30",
      amount: money(-200, "USD"),
      categoryId: "groceries",
    });

    expect(transactions()).toEqual([
      {
        id: salary,
        accountId: "checking",
        date: "2026-10-25",
        amount: money(300000, "USD"),
        payee: "Employer",
      },
      {
        id: refund,
        accountId: "checking",
        date: "2026-10-12",
        amount: money(1000, "USD"),
        categoryId: "groceries",
      },
      {
        id: groceries,
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-4550, "USD"),
        categoryId: "groceries",
        payee: "Corner Shop",
        memo: "Milk and bread",
      },
      {
        id: older,
        accountId: "checking",
        date: "2026-09-30",
        amount: money(-200, "USD"),
        categoryId: "groceries",
      },
    ]);
  });

  it("edits a Transaction: the edit replaces what was recorded", () => {
    const { writer, transactions } = budget();
    const id = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: "groceries",
      payee: "Corner Shop",
      memo: "Milk",
    });

    editTransaction(writer, id, {
      accountId: "checking",
      date: "2026-09-30",
      amount: money(2000, "USD"),
      payee: "Employer",
    });

    expect(transactions()).toEqual([
      {
        id,
        accountId: "checking",
        date: "2026-09-30",
        amount: money(2000, "USD"),
        payee: "Employer",
      },
    ]);
  });

  it("deletes a Transaction, after which it can't be edited or deleted again", () => {
    const { writer, transactions } = budget();
    const kept = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-10-01",
      amount: money(2000, "USD"),
    });
    const deleted = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: "groceries",
    });

    deleteTransaction(writer, deleted);

    expect(transactions().map(({ id }) => id)).toEqual([kept]);
    expect(() => deleteTransaction(writer, deleted)).toThrow(
      `No Transaction ${deleted}`,
    );
    expect(() =>
      editTransaction(writer, deleted, {
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-100, "USD"),
        categoryId: "groceries",
      }),
    ).toThrow(`No Transaction ${deleted}`);
  });

  it("edits under the same rules as recording", () => {
    const { writer, transactions } = budget();
    const id = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: "groceries",
    });

    expect(() =>
      editTransaction(writer, id, {
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-4550, "USD"),
      }),
    ).toThrow(/needs a Category/);
    expect(transactions()).toEqual([
      {
        id,
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-4550, "USD"),
        categoryId: "groceries",
      },
    ]);
  });

  describe("when two devices change the same Transaction, the most recent change wins", () => {
    function edit(deviceId: string, wallTime: number): TransactionEdited {
      return {
        id: `edit-${deviceId}`,
        subjectId: "lunch",
        deviceId,
        timestamp: { wallTime, counter: 0 },
        type: "TransactionEdited",
        payload: {
          version: 1,
          accountId: "checking",
          date: "2026-10-12",
          amount: money(-1200, "USD"),
          categoryId: "groceries",
          payee: `Edited on ${deviceId}`,
        },
      };
    }
    function deletion(deviceId: string, wallTime: number): TransactionDeleted {
      return {
        id: `delete-${deviceId}`,
        subjectId: "lunch",
        deviceId,
        timestamp: { wallTime, counter: 0 },
        type: "TransactionDeleted",
        payload: { version: 1 },
      };
    }

    it.each<[string, ChangeRecord[], string[]]>([
      [
        "a later edit beats an earlier deletion",
        [deletion("phone", 2_000), edit("laptop", 3_000)],
        ["Edited on laptop"],
      ],
      [
        "a later deletion beats an earlier edit",
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
              accountId: "checking",
              date: "2026-10-12",
              amount: money(-900, "USD"),
              categoryId: "groceries",
            },
          },
        ]);
        for (const change of order) changeLog.append([change]);

        expect(transactions().map(({ payee }) => payee)).toEqual(payees);
      }
    });
  });

  it("keeps a closed Account's Transactions but takes no new ones, and no changes to them", () => {
    const { changeLog, writer } = budget();
    writer.write<AccountOpened["type"], AccountOpened["payload"]>(
      "old",
      "AccountOpened",
      {
        version: 1,
        name: "Old checking",
        kind: "checking",
        openingBalance: money(0, "USD"),
      },
    );
    const record = (accountId: string, cents: number) =>
      recordTransaction(writer, {
        accountId,
        date: "2026-10-12",
        amount: money(cents, "USD"),
        categoryId: "groceries",
      });
    const refund = record("old", 1000);
    const spent = record("old", -1000);
    const inChecking = record("checking", -500);
    writer.write<AccountClosed["type"], AccountClosed["payload"]>(
      "old",
      "AccountClosed",
      { version: 1 },
    );

    expect(() => record("old", -200)).toThrow("Old checking is closed");
    expect(() =>
      editTransaction(writer, refund, {
        accountId: "old",
        date: "2026-10-12",
        amount: money(2000, "USD"),
        categoryId: "groceries",
      }),
    ).toThrow("Old checking is closed");
    expect(() =>
      editTransaction(writer, spent, {
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-1000, "USD"),
        categoryId: "groceries",
      }),
    ).toThrow("Old checking is closed");
    expect(() =>
      editTransaction(writer, inChecking, {
        accountId: "old",
        date: "2026-10-12",
        amount: money(-500, "USD"),
        categoryId: "groceries",
      }),
    ).toThrow("Old checking is closed");
    expect(() => deleteTransaction(writer, spent)).toThrow(
      "Old checking is closed",
    );
    expect(
      accountTransactions(changeLog.readAll(), "old").map(({ id }) => id),
    ).toEqual([spent, refund]);
  });

  it("suggests each Payee used before once, in alphabetical order, from Transactions that still exist", () => {
    const { writer, payees } = budget();
    const record = (payee: string) =>
      recordTransaction(writer, {
        accountId: "checking",
        date: "2026-10-12",
        amount: money(1000, "USD"),
        payee,
      });
    record("corner shop");
    record("Employer");
    record("Corner Shop");
    record("Employer");
    record("");
    deleteTransaction(writer, record("Typo Mart"));
    const renamed = record("Bakry");
    editTransaction(writer, renamed, {
      accountId: "checking",
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

  it("lists an Account's Transfers among its Transactions, signed for that Account", () => {
    const { writer, transactionList } = budget();
    const transfer = (
      id: string,
      fromAccountId: string,
      toAccountId: string,
      date: string,
      cents: number,
    ) =>
      writer.write<TransferMade["type"], TransferMade["payload"]>(
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
    transfer("to-savings", "checking", "savings", "2026-10-12", 20000);
    const groceries = recordTransaction(writer, {
      accountId: "checking",
      date: "2026-10-12",
      amount: money(-4550, "USD"),
      categoryId: "groceries",
    });
    transfer("from-savings", "savings", "checking", "2026-10-20", 5000);
    transfer("deleted", "checking", "savings", "2026-10-21", 100);
    writer.write<TransferDeleted["type"], TransferDeleted["payload"]>(
      "deleted",
      "TransferDeleted",
      { version: 1 },
    );

    expect(transactionList()).toEqual([
      {
        kind: "transfer",
        id: "from-savings",
        date: "2026-10-20",
        amount: money(5000, "USD"),
        otherAccountId: "savings",
      },
      {
        kind: "transaction",
        id: groceries,
        accountId: "checking",
        date: "2026-10-12",
        amount: money(-4550, "USD"),
        categoryId: "groceries",
      },
      {
        kind: "transfer",
        id: "to-savings",
        date: "2026-10-12",
        amount: money(-20000, "USD"),
        otherAccountId: "savings",
        memo: "Rainy day",
      },
    ]);
  });

  it("lists an Account's Adjustments among its Transactions, on the day the balance was re-declared", () => {
    const { changeLog, writer, transactionList } = budget();
    const groceries = recordTransaction(writer, {
      accountId: "checking",
      date: "2100-01-15",
      amount: money(-4550, "USD"),
      categoryId: "groceries",
    });
    // A clock ahead of the records already written, which the Change Log keeps in order.
    const redeclared = createChangeLogWriter(changeLog, "this-device", {
      now: () => new Date(2100, 0, 14, 12).getTime(),
    }).write<BalanceRedeclared["type"], BalanceRedeclared["payload"]>(
      "checking",
      "BalanceRedeclared",
      { version: 1, balance: money(95000, "USD") },
    );

    expect(transactionList()).toEqual([
      expect.objectContaining({ kind: "transaction", id: groceries }),
      {
        kind: "adjustment",
        id: redeclared.id,
        date: "2100-01-14",
        amount: money(-450, "USD"),
      },
    ]);
  });
});
