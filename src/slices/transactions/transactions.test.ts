import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { AccountOpened } from "../accounts/records";
import type { BudgetCreated } from "../budget-setup/records";
import type {
  CategoryCreated,
  CategoryGroupCreated,
} from "../categories/records";
import type { TransferDeleted, TransferMade } from "../transfers/records";
import { recordTransaction } from "./commands";
import { accountTransactionList, accountTransactions } from "./index";

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
    transactions: () => accountTransactions(changeLog.readAll(), "checking"),
    transactionList: () =>
      accountTransactionList(changeLog.readAll(), "checking"),
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
});
