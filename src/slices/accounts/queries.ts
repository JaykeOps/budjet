import {
  type ChangeRecord,
  deletedSubjects,
  perSnapshot,
} from "../../kernel/change-log";
import { addMoney, type Money, money } from "../../kernel/money";
import { isBudgetCreated } from "../budget-setup/records";
import {
  isTransactionDeleted,
  isTransactionEdited,
  isTransactionRecorded,
} from "../transactions/records";
import {
  isTransferDeleted,
  isTransferEdited,
  isTransferMade,
} from "../transfers/records";
import {
  type AccountKind,
  isAccountClosed,
  isAccountOpened,
  isAccountRenamed,
  isBalanceRedeclared,
  isRedeclaredBalanceDeleted,
} from "./records";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  closed: boolean;
  balance: Money;
  /**
   * The day of the latest re-declaration, Adjustment or Balance check, on this
   * device's calendar, "YYYY-MM-DD". Absent until the first one: adding an
   * Account doesn't count.
   */
  lastChecked?: string;
};

/** The money a re-declared balance added to (above zero) or took from an Account. */
export type Adjustment = {
  /** The id of the record that re-declared the balance. */
  id: string;
  accountId: string;
  /** The day the balance was re-declared, on this device's calendar, "YYYY-MM-DD". */
  date: string;
  amount: Money;
  /** The balance the user re-declared. */
  balance: Money;
};

/** What an Account held when it was added to the Budget. */
export type OpeningBalance = {
  /** The id of the record that opened the Account. */
  id: string;
  accountId: string;
  /** The day the Account was opened, on this device's calendar, "YYYY-MM-DD". */
  date: string;
  amount: Money;
};

/** A re-declared balance equal to the balance just before it. Nothing moved. */
export type BalanceCheck = {
  /** The id of the record that re-declared the balance. */
  id: string;
  accountId: string;
  /** The day the balance was re-declared, on this device's calendar, "YYYY-MM-DD". */
  date: string;
  balance: Money;
};

/**
 * Every Account, in the order they were opened, with its latest name, whether
 * it is closed, and its balance: its Opening Balance plus its Adjustments,
 * plus money coming in less money going out, counting each Transaction as
 * last edited, plus Transfers in less Transfers out.
 */
export function accounts(records: readonly ChangeRecord[]): Account[] {
  const { balances } = ledger(records);
  const deleted = deletedRedeclarations(records);
  const byId = new Map<string, Account>();
  for (const record of records) {
    if (isAccountOpened(record)) {
      const { name, kind, openingBalance } = record.payload;
      byId.set(record.subjectId, {
        id: record.subjectId,
        name,
        kind,
        closed: false,
        balance: money(
          balances.get(record.subjectId) ?? 0,
          openingBalance.currency,
        ),
      });
    } else if (isAccountRenamed(record)) {
      const account = byId.get(record.subjectId);
      if (account) account.name = record.payload.name;
    } else if (isAccountClosed(record)) {
      const account = byId.get(record.subjectId);
      if (account) account.closed = true;
    } else if (isBalanceRedeclared(record) && !deleted.has(record.id)) {
      const account = byId.get(record.subjectId);
      if (account) account.lastChecked = localDate(record.timestamp.wallTime);
    }
  }
  return [...byId.values()];
}

/**
 * Every Adjustment, oldest first: each re-declared balance that differs from
 * the Account's balance just before it, less that balance, in Change Log
 * order. Every slice that counts Adjustments reads them through this. Expects
 * records oldest first, as `readAll` returns them.
 */
export function adjustments(
  records: readonly ChangeRecord[],
): readonly Adjustment[] {
  return ledger(records).adjustments;
}

/**
 * Every Balance check, oldest first: each re-declared balance equal to the
 * Account's balance just before it, in Change Log order. A record that arrives
 * late from another device can turn one into an Adjustment, and back. Expects
 * records oldest first, as `readAll` returns them.
 */
export function balanceChecks(
  records: readonly ChangeRecord[],
): readonly BalanceCheck[] {
  return ledger(records).balanceChecks;
}

/** Every Opening Balance, oldest first. It is never deleted, even at $0.00. */
export function openingBalances(
  records: readonly ChangeRecord[],
): OpeningBalance[] {
  return records.filter(isAccountOpened).map((record) => ({
    id: record.id,
    accountId: record.subjectId,
    date: localDate(record.timestamp.wallTime),
    amount: record.payload.openingBalance,
  }));
}

/** An Account's balance. */
export function accountBalance(
  records: readonly ChangeRecord[],
  accountId: string,
): Money {
  const account = accounts(records).find(({ id }) => id === accountId);
  if (!account) throw new Error(`No Account ${accountId}`);
  return account.balance;
}

/**
 * The money across every Account, in the Budget's currency. Undefined before a
 * Budget exists.
 */
export function accountsTotal(
  records: readonly ChangeRecord[],
): Money | undefined {
  const budget = records.findLast(isBudgetCreated);
  if (!budget) return undefined;
  return accounts(records).reduce(
    (total, { balance }) => addMoney(total, balance),
    money(0, budget.payload.currency),
  );
}

type Ledger = {
  /** Each Account's balance now, in minor units, by Account id. */
  balances: ReadonlyMap<string, number>;
  adjustments: readonly Adjustment[];
  balanceChecks: readonly BalanceCheck[];
};

/**
 * The ids of the `BalanceRedeclared` records that were deleted. Read up front,
 * because a deletion wins wherever it falls in the Change Log (docs/adr/0006).
 */
const deletedRedeclarations = perSnapshot(
  (records: readonly ChangeRecord[]): ReadonlySet<string> =>
    deletedSubjects(records, isRedeclaredBalanceDeleted),
);

/**
 * The one place an Account balance is calculated (docs/adr/0005). Replays
 * every record that moves an Account's balance, in Change Log order, so each
 * re-declared balance can be measured against the balance just before it. A
 * Transaction or Transfer counts as each of its records leaves it: an edit
 * moves the difference, so the latest record of each wins (docs/adr/0004), and
 * a deletion takes it back out, after which later records about it count for
 * nothing (docs/adr/0006). That stays positional rather than leaving the subject
 * out up front: a re-declaration before the deletion was measured with it counted.
 * It reads the Transactions and Transfers records
 * directly because both of those slices depend on Accounts.
 */
const ledger = perSnapshot((records: readonly ChangeRecord[]): Ledger => {
  const deleted = deletedRedeclarations(records);
  const balances = new Map<string, number>();
  const move = (accountId: string, minorUnits: number) =>
    balances.set(accountId, (balances.get(accountId) ?? 0) + minorUnits);
  /** What each Transaction or Transfer currently does to which Accounts. */
  const effects = new Map<string, [accountId: string, minorUnits: number][]>();
  const gone = new Set<string>();
  const replace = (
    subjectId: string,
    now: [accountId: string, minorUnits: number][],
  ) => {
    if (gone.has(subjectId)) return;
    for (const [accountId, minorUnits] of effects.get(subjectId) ?? []) {
      move(accountId, -minorUnits);
    }
    for (const [accountId, minorUnits] of now) move(accountId, minorUnits);
    effects.set(subjectId, now);
  };
  const foundAdjustments: Adjustment[] = [];
  const foundChecks: BalanceCheck[] = [];
  for (const record of records) {
    if (isAccountOpened(record)) {
      move(record.subjectId, record.payload.openingBalance.minorUnits);
    } else if (isBalanceRedeclared(record)) {
      if (deleted.has(record.id)) continue;
      const { balance } = record.payload;
      const difference =
        balance.minorUnits - (balances.get(record.subjectId) ?? 0);
      const redeclared = {
        id: record.id,
        accountId: record.subjectId,
        date: localDate(record.timestamp.wallTime),
      };
      if (difference === 0) {
        foundChecks.push({ ...redeclared, balance });
      } else {
        move(record.subjectId, difference);
        foundAdjustments.push({
          ...redeclared,
          amount: money(difference, balance.currency),
          balance,
        });
      }
    } else if (isTransactionRecorded(record) || isTransactionEdited(record)) {
      const { accountId, amount } = record.payload;
      replace(record.subjectId, [[accountId, amount.minorUnits]]);
    } else if (isTransferMade(record) || isTransferEdited(record)) {
      const { fromAccountId, toAccountId, amount } = record.payload;
      replace(record.subjectId, [
        [fromAccountId, -amount.minorUnits],
        [toAccountId, amount.minorUnits],
      ]);
    } else if (isTransactionDeleted(record) || isTransferDeleted(record)) {
      replace(record.subjectId, []);
      gone.add(record.subjectId);
    }
  }
  return {
    balances,
    adjustments: foundAdjustments,
    balanceChecks: foundChecks,
  };
});

function localDate(wallTime: number): string {
  const day = new Date(wallTime);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}
