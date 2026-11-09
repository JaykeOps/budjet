import { describe, expect, it } from "vitest";
import {
  type ChangeLogWriter,
  type ChangeRecord,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "./kernel/change-log";
import { type Money, money } from "./kernel/money";
import type { Month } from "./kernel/month";
import { accounts, adjustments, balanceChecks } from "./slices/accounts";
import {
  closeAccount,
  openAccount,
  redeclareBalance,
} from "./slices/accounts/commands";
import { assignment, takeBack } from "./slices/assignments";
import { copyLastMonth, setAssignment } from "./slices/assignments/commands";
import { createBudget } from "./slices/budget-setup/commands";
import { available, readyToAssign } from "./slices/budget-totals";
import {
  createCategory,
  createCategoryGroup,
} from "./slices/categories/commands";
import { transactionList } from "./slices/transactions";
import {
  editTransaction,
  recordTransaction,
} from "./slices/transactions/commands";
import { currentTransactions } from "./slices/transactions/records";
import { editTransfer, makeTransfer } from "./slices/transfers/commands";
import { currentTransfers } from "./slices/transfers/records";
import {
  copyLastMonthWithUndo,
  deleteRedeclaredBalanceWithUndo,
  deleteTransactionWithUndo,
  deleteTransferWithUndo,
  editTransactionWithUndo,
  editTransferWithUndo,
  moveMoneyWithUndo,
  setAssignmentWithUndo,
} from "./undo";

const usd = (minorUnits: number): Money => money(minorUnits, "USD");

/**
 * A phone and a laptop, each with its own Change Log, sharing a Budget in USD
 * with Accounts "checking" ($1,000.00) and "savings" ($500.00) and a Category.
 * Nothing crosses between them until `sync`, so what they do in between is
 * what two devices do offline.
 */
function twoDevices() {
  let clock = Date.parse("2026-10-01T12:00:00Z");
  const now = () => {
    clock += 60_000;
    return clock;
  };
  const device = (deviceId: string) => {
    const changeLog = createInMemoryChangeLog();
    return {
      changeLog,
      writer: createChangeLogWriter(changeLog, deviceId, { now }),
      records: () => changeLog.readAll(),
    };
  };
  const phone = device("phone");
  const laptop = device("laptop");
  const sync = () => {
    laptop.changeLog.merge(phone.records());
    phone.changeLog.merge(laptop.records());
  };

  createBudget(phone.writer, { currency: "USD" });
  const checking = openAccount(phone.writer, {
    name: "Checking",
    kind: "checking",
    openingBalance: usd(100000),
  });
  const savings = openAccount(phone.writer, {
    name: "Savings",
    kind: "savings",
    openingBalance: usd(50000),
  });
  const group = createCategoryGroup(phone.writer, { name: "Everyday" });
  const groceries = createCategory(phone.writer, {
    groupId: group,
    name: "Groceries",
  });
  sync();

  const balance = (records: readonly ChangeRecord[], id = checking) =>
    accounts(records).find((account) => account.id === id)?.balance;
  const lunch = (writer: ChangeLogWriter) =>
    recordTransaction(writer, {
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-1200),
      categoryId: groceries,
      payee: "Corner Bistro",
      memo: "With Sam",
    });
  return {
    phone,
    laptop,
    sync,
    checking,
    savings,
    group,
    groceries,
    balance,
    lunch,
  };
}

const listed = (records: readonly ChangeRecord[], accountId: string) =>
  transactionList(records, accountId)
    .filter(({ kind }) => kind !== "opening-balance")
    .map((entry) => entry.id);

describe("undoing a Transaction's delete", () => {
  it("writes a new Transaction with a fresh id, the same content and the same place in the list", () => {
    const { phone, checking, groceries, balance, lunch } = twoDevices();
    const before = recordTransaction(phone.writer, {
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-100),
      categoryId: groceries,
      payee: "Before",
    });
    const deleted = lunch(phone.writer);
    const after = recordTransaction(phone.writer, {
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-300),
      categoryId: groceries,
      payee: "After",
    });

    const undo = deleteTransactionWithUndo(phone.writer, deleted);
    expect(listed(phone.records(), checking)).toEqual([after, before]);
    undo();

    const records = phone.records();
    const [newest, restored, oldest] = listed(records, checking);
    expect([newest, oldest]).toEqual([after, before]);
    expect(restored).not.toBe(deleted);
    expect(
      currentTransactions(records).find(({ id }) => id === restored),
    ).toEqual({
      id: restored,
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-1200),
      categoryId: groceries,
      payee: "Corner Bistro",
      memo: "With Sam",
    });
    expect(balance(records)).toEqual(usd(100000 - 100 - 1200 - 300));
  });

  it("keeps its place when that Transaction is deleted and undone again, or edited", () => {
    const { phone, checking, groceries, lunch } = twoDevices();
    const first = lunch(phone.writer);
    const later = recordTransaction(phone.writer, {
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-300),
      categoryId: groceries,
    });

    deleteTransactionWithUndo(phone.writer, first)();
    const restored = listed(phone.records(), checking)[1] ?? "";
    deleteTransactionWithUndo(phone.writer, restored)();
    const again = listed(phone.records(), checking)[1] ?? "";
    editTransaction(phone.writer, again, {
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-1300),
      categoryId: groceries,
    });

    expect(listed(phone.records(), checking)).toEqual([later, again]);
    expect(again).not.toBe(restored);
  });

  it("leaves an Adjustment made since as it was, because the money goes and comes back after it", () => {
    const { phone, checking, balance, lunch } = twoDevices();
    const deleted = lunch(phone.writer);
    redeclareBalance(phone.writer, checking, { balance: usd(90000) });
    const adjusted = () => adjustments(phone.records()).map((a) => a.amount);
    expect(adjusted()).toEqual([usd(90000 - 98800)]);

    deleteTransactionWithUndo(phone.writer, deleted)();

    expect(adjusted()).toEqual([usd(90000 - 98800)]);
    expect(balance(phone.records())).toEqual(usd(90000));
  });
});

describe("undoing a Transaction's edit", () => {
  it("writes the previous values as a new record, under the same id", () => {
    const { phone, checking, savings, groceries, balance, lunch } =
      twoDevices();
    const id = lunch(phone.writer);
    const logged = phone.records().length;

    const undo = editTransactionWithUndo(phone.writer, id, {
      accountId: savings,
      date: "2026-10-13",
      amount: usd(3000),
      payee: "Refund",
    });
    expect(balance(phone.records(), savings)).toEqual(usd(53000));
    undo();

    expect(phone.records().length).toBe(logged + 2);
    expect(phone.records().at(-1)?.type).toBe("TransactionEdited");
    expect(currentTransactions(phone.records())).toEqual([
      {
        id,
        accountId: checking,
        date: "2026-10-12",
        amount: usd(-1200),
        categoryId: groceries,
        payee: "Corner Bistro",
        memo: "With Sam",
      },
    ]);
    expect(balance(phone.records(), savings)).toEqual(usd(50000));
  });
});

describe("undoing a Transfer's delete and edit", () => {
  it("brings a deleted Transfer back with a fresh id, the same details and the same place", () => {
    const { phone, checking, savings, balance } = twoDevices();
    const move = (minorUnits: number, memo?: string) =>
      makeTransfer(phone.writer, {
        fromAccountId: checking,
        toAccountId: savings,
        date: "2026-10-12",
        amount: usd(minorUnits),
        memo,
      });
    const deleted = move(2000, "Rainy day");
    const later = move(100);

    deleteTransferWithUndo(phone.writer, deleted)();

    const records = phone.records();
    const [newest, restored] = listed(records, checking);
    expect(newest).toBe(later);
    expect(restored).not.toBe(deleted);
    expect(currentTransfers(records).get(restored ?? "")).toEqual({
      fromAccountId: checking,
      toAccountId: savings,
      date: "2026-10-12",
      amount: usd(2000),
      memo: "Rainy day",
    });
    expect(balance(records)).toEqual(usd(100000 - 2000 - 100));
  });

  it("writes a Transfer's previous details back after an edit", () => {
    const { phone, checking, savings, balance } = twoDevices();
    const id = makeTransfer(phone.writer, {
      fromAccountId: checking,
      toAccountId: savings,
      date: "2026-10-12",
      amount: usd(2000),
    });

    editTransferWithUndo(phone.writer, id, {
      fromAccountId: savings,
      toAccountId: checking,
      date: "2026-10-13",
      amount: usd(500),
    })();

    expect(currentTransfers(phone.records()).get(id)).toEqual({
      fromAccountId: checking,
      toAccountId: savings,
      date: "2026-10-12",
      amount: usd(2000),
    });
    expect(balance(phone.records())).toEqual(usd(98000));
  });
});

describe("undoing a re-declared balance's delete", () => {
  it("measures it again from where it was, not against what happened since", () => {
    const { phone, checking, balance, lunch } = twoDevices();
    const redeclared = redeclareBalance(phone.writer, checking, {
      balance: usd(90000),
    });
    const date = adjustments(phone.records())[0]?.date;
    lunch(phone.writer);
    expect(balance(phone.records())).toEqual(usd(88800));

    const undo = deleteRedeclaredBalanceWithUndo(phone.writer, redeclared);
    expect(balance(phone.records())).toEqual(usd(98800));
    undo();

    const records = phone.records();
    expect(balance(records)).toEqual(usd(88800));
    const [adjustment, ...others] = adjustments(records);
    expect(others).toEqual([]);
    expect(adjustment?.id).not.toBe(redeclared);
    expect(adjustment?.amount).toEqual(usd(-10000));
    expect(adjustment?.date).toBe(date);
    expect(listed(records, checking).at(-1)).toBe(adjustment?.id);
  });

  it("turns a later Balance check back from the Adjustment its delete made it", () => {
    const { phone, checking } = twoDevices();
    const first = redeclareBalance(phone.writer, checking, {
      balance: usd(90000),
    });
    const check = redeclareBalance(phone.writer, checking, {
      balance: usd(90000),
    });

    const undo = deleteRedeclaredBalanceWithUndo(phone.writer, first);
    expect(balanceChecks(phone.records())).toEqual([]);
    undo();

    expect(balanceChecks(phone.records()).map(({ id }) => id)).toEqual([check]);
    expect(adjustments(phone.records())).toHaveLength(1);
  });

  it("restores its place again after a second delete and Undo", () => {
    const { phone, checking, balance, lunch } = twoDevices();
    const redeclared = redeclareBalance(phone.writer, checking, {
      balance: usd(90000),
    });
    lunch(phone.writer);

    deleteRedeclaredBalanceWithUndo(phone.writer, redeclared)();
    const restored = adjustments(phone.records())[0]?.id ?? "";
    deleteRedeclaredBalanceWithUndo(phone.writer, restored)();

    expect(balance(phone.records())).toEqual(usd(88800));
    expect(adjustments(phone.records())[0]?.id).not.toBe(restored);
  });
});

describe("Undo's records merging from two devices", () => {
  it("counts a Transaction once when one device undoes its delete and the other edited it", () => {
    const { phone, laptop, sync, checking, groceries, balance, lunch } =
      twoDevices();
    const id = lunch(phone.writer);
    sync();

    const undo = deleteTransactionWithUndo(phone.writer, id);
    undo();
    // Written after the delete, by a device that hadn't seen it.
    editTransaction(laptop.writer, id, {
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-9900),
      categoryId: groceries,
    });
    sync();

    for (const { records } of [phone, laptop]) {
      expect(currentTransactions(records()).map((t) => t.amount)).toEqual([
        usd(-1200),
      ]);
      expect(balance(records())).toEqual(usd(98800));
      expect(available(records(), groceries, "2026-10")).toEqual(usd(-1200));
    }
    expect(laptop.records()).toEqual(phone.records());
  });

  it("keeps a Transaction deleted when another device undoes an edit to it", () => {
    const { phone, laptop, sync, checking, groceries, balance, lunch } =
      twoDevices();
    const id = lunch(phone.writer);
    sync();

    deleteTransactionWithUndo(laptop.writer, id);
    const undo = editTransactionWithUndo(phone.writer, id, {
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-500),
      categoryId: groceries,
    });
    undo();
    sync();

    for (const { records } of [phone, laptop]) {
      expect(currentTransactions(records())).toEqual([]);
      expect(balance(records())).toEqual(usd(100000));
    }
  });

  it("lets a later edit on another device beat an undone edit, and an undone edit beat an earlier one", () => {
    const { phone, laptop, sync, checking, groceries, lunch } = twoDevices();
    const id = lunch(phone.writer);
    sync();
    const edit = (payee: string) => ({
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-1200),
      categoryId: groceries,
      payee,
    });
    const payee = () => currentTransactions(phone.records())[0]?.payee;

    const undo = editTransactionWithUndo(phone.writer, id, edit("Phone"));
    editTransaction(laptop.writer, id, edit("Laptop, earlier"));
    undo();
    sync();
    expect(payee()).toBe("Corner Bistro");

    const undoAgain = editTransactionWithUndo(phone.writer, id, edit("Phone"));
    undoAgain();
    editTransaction(laptop.writer, id, edit("Laptop, later"));
    sync();
    expect(payee()).toBe("Laptop, later");
  });

  it("counts a Transfer once when one device undoes its delete and the other edited it", () => {
    const { phone, laptop, sync, checking, savings, balance } = twoDevices();
    const id = makeTransfer(phone.writer, {
      fromAccountId: checking,
      toAccountId: savings,
      date: "2026-10-12",
      amount: usd(2000),
    });
    sync();

    deleteTransferWithUndo(phone.writer, id)();
    editTransfer(laptop.writer, id, {
      fromAccountId: checking,
      toAccountId: savings,
      date: "2026-10-12",
      amount: usd(7000),
    });
    sync();

    for (const { records } of [phone, laptop]) {
      expect(currentTransfers(records()).size).toBe(1);
      expect(balance(records())).toEqual(usd(98000));
      expect(balance(records(), savings)).toEqual(usd(52000));
    }
  });

  it("agrees on a restored re-declaration's place across devices, with what the other device did since", () => {
    const { phone, laptop, sync, checking, balance, lunch } = twoDevices();
    const redeclared = redeclareBalance(phone.writer, checking, {
      balance: usd(90000),
    });
    sync();

    lunch(laptop.writer);
    deleteRedeclaredBalanceWithUndo(phone.writer, redeclared)();
    sync();

    for (const { records } of [phone, laptop]) {
      expect(balance(records())).toEqual(usd(88800));
      expect(adjustments(records()).map((a) => a.amount)).toEqual([
        usd(-10000),
      ]);
    }
    expect(laptop.records()).toEqual(phone.records());
  });

  it("keeps the money right when both devices undo the same re-declaration's delete", () => {
    const { phone, laptop, sync, checking, balance } = twoDevices();
    const redeclared = redeclareBalance(phone.writer, checking, {
      balance: usd(90000),
    });
    sync();

    deleteRedeclaredBalanceWithUndo(phone.writer, redeclared)();
    deleteRedeclaredBalanceWithUndo(laptop.writer, redeclared)();
    sync();

    for (const { records } of [phone, laptop]) {
      expect(balance(records())).toEqual(usd(90000));
      expect(adjustments(records())).toHaveLength(1);
      expect(balanceChecks(records())).toHaveLength(1);
    }
  });

  it("leaves two Transactions, each visible and deletable, when both devices undo the same delete", () => {
    const { phone, laptop, sync, balance, lunch } = twoDevices();
    const id = lunch(phone.writer);
    sync();

    deleteTransactionWithUndo(phone.writer, id)();
    deleteTransactionWithUndo(laptop.writer, id)();
    sync();

    expect(currentTransactions(phone.records())).toHaveLength(2);
    expect(balance(phone.records())).toEqual(usd(100000 - 2400));
  });

  it("refuses an Undo once another device's change has ruled it out", () => {
    const { phone, laptop, sync, checking, groceries, lunch } = twoDevices();
    const id = lunch(phone.writer);
    const emptied = openAccount(phone.writer, {
      name: "Old",
      kind: "cash",
      openingBalance: usd(0),
    });
    const inOld = recordTransaction(phone.writer, {
      accountId: emptied,
      date: "2026-10-12",
      amount: usd(100),
    });
    sync();

    const undoEdit = editTransactionWithUndo(phone.writer, id, {
      accountId: checking,
      date: "2026-10-12",
      amount: usd(-500),
      categoryId: groceries,
    });
    deleteTransactionWithUndo(laptop.writer, id);
    const undoDelete = deleteTransactionWithUndo(phone.writer, inOld);
    sync();
    closeAccount(laptop.writer, emptied);
    sync();

    expect(undoEdit).toThrow(RangeError);
    expect(undoDelete).toThrow(RangeError);
  });
});

describe("undoing Assignments", () => {
  const october: Month = "2026-10";
  const november: Month = "2026-11";

  function aBudget() {
    const { phone, group, groceries } = twoDevices();
    const { writer } = phone;
    const dining = createCategory(writer, {
      groupId: group,
      name: "Dining Out",
    });
    const assignedIn = (categoryId: string, of = october) =>
      assignment(phone.records(), categoryId, of);
    const takenBackIn = (categoryId: string, of = october) =>
      takeBack(phone.records(), categoryId, of);
    const ready = () => readyToAssign(phone.records());
    return {
      writer,
      groceries,
      dining,
      assignedIn,
      takenBackIn,
      ready,
    };
  }

  it("writes the previous Assignment back", () => {
    const { writer, groceries, assignedIn, ready } = aBudget();
    setAssignment(writer, {
      categoryId: groceries,
      month: october,
      amount: usd(10000),
    });
    const before = ready();

    const undo = setAssignmentWithUndo(writer, {
      categoryId: groceries,
      month: october,
      amount: usd(25000),
    });
    expect(assignedIn(groceries)).toEqual(usd(25000));
    undo();

    expect(assignedIn(groceries)).toEqual(usd(10000));
    expect(ready()).toEqual(before);
  });

  it("restores the Take-back a typed negative added", () => {
    const { writer, groceries, assignedIn, takenBackIn, ready } = aBudget();
    setAssignment(writer, {
      categoryId: groceries,
      month: october,
      amount: usd(10000),
    });
    const before = ready();

    const undo = setAssignmentWithUndo(writer, {
      categoryId: groceries,
      month: october,
      amount: usd(-500),
    });
    expect(takenBackIn(groceries)).toEqual(usd(500));
    undo();

    expect(assignedIn(groceries)).toEqual(usd(10000));
    expect(takenBackIn(groceries)?.minorUnits ?? 0).toBe(0);
    expect(ready()).toEqual(before);
  });

  it("puts both ends of a move back, Take-back included", () => {
    const { writer, groceries, dining, assignedIn, takenBackIn, ready } =
      aBudget();
    setAssignment(writer, {
      categoryId: groceries,
      month: october,
      amount: usd(1000),
    });
    const before = ready();

    const undo = moveMoneyWithUndo(writer, {
      fromCategoryId: groceries,
      toCategoryId: dining,
      month: october,
      amount: usd(1500),
    });
    expect(takenBackIn(groceries)).toEqual(usd(500));
    undo();

    expect(assignedIn(groceries)).toEqual(usd(1000));
    expect(assignedIn(dining)).toBeUndefined();
    expect(takenBackIn(groceries)?.minorUnits ?? 0).toBe(0);
    expect(ready()).toEqual(before);
  });

  it("empties what a copy filled, so the same copy can run again", () => {
    const { writer, groceries, dining, assignedIn } = aBudget();
    setAssignment(writer, {
      categoryId: groceries,
      month: october,
      amount: usd(1000),
    });
    setAssignment(writer, {
      categoryId: dining,
      month: october,
      amount: usd(2000),
    });
    setAssignment(writer, {
      categoryId: dining,
      month: november,
      amount: usd(300),
    });

    const { copied, undo } = copyLastMonthWithUndo(writer, {
      month: november,
    });
    expect(copied).toBe(1);
    expect(assignedIn(groceries, november)).toEqual(usd(1000));
    undo();

    expect(assignedIn(groceries, november)).toBeUndefined();
    expect(assignedIn(dining, november)).toEqual(usd(300));

    copyLastMonth(writer, { month: november });
    expect(assignedIn(groceries, november)).toEqual(usd(1000));
  });

  it("goes back to an Assignment set to zero, which a copy leaves alone", () => {
    const { writer, groceries, assignedIn } = aBudget();
    setAssignment(writer, {
      categoryId: groceries,
      month: october,
      amount: usd(1000),
    });
    setAssignment(writer, {
      categoryId: groceries,
      month: november,
      amount: usd(0),
    });

    setAssignmentWithUndo(writer, {
      categoryId: groceries,
      month: november,
      amount: usd(70),
    })();

    expect(assignedIn(groceries, november)).toEqual(usd(0));
  });

  it("leaves nothing assigned behind after undoing a first Assignment to zero", () => {
    const { writer, groceries, assignedIn } = aBudget();

    setAssignmentWithUndo(writer, {
      categoryId: groceries,
      month: october,
      amount: usd(0),
    })();

    expect(assignedIn(groceries)).toBeUndefined();
  });
});
