/**
 * The change records Accounts publishes. Other slices may read them; they are
 * versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import type { ChangeRecord } from "../../kernel/change-log";
import { type Money, money } from "../../kernel/money";
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

/** Where an Account's money sits. Credit cards and loans are not Accounts. */
export type AccountKind = "checking" | "savings" | "cash";

/** An Account added to the Budget. Its Opening Balance goes to Ready to Assign. */
export type AccountOpened = ChangeRecord<
  "AccountOpened",
  { version: 1; name: string; kind: AccountKind; openingBalance: Money }
>;

export function isAccountOpened(record: ChangeRecord): record is AccountOpened {
  return record.type === "AccountOpened";
}

/** An Account's new name. The latest one wins. Its subject is the Account's id. */
export type AccountRenamed = ChangeRecord<
  "AccountRenamed",
  { version: 1; name: string }
>;

export function isAccountRenamed(
  record: ChangeRecord,
): record is AccountRenamed {
  return record.type === "AccountRenamed";
}

/**
 * An Account the user no longer uses. Its history stays, but it takes no new
 * Transactions or Transfers. Its subject is the Account's id.
 */
export type AccountClosed = ChangeRecord<"AccountClosed", { version: 1 }>;

export function isAccountClosed(record: ChangeRecord): record is AccountClosed {
  return record.type === "AccountClosed";
}

/**
 * The user's statement of what an Account really holds. The Adjustment is the
 * difference from the Account's balance just before this record. Its subject
 * is the Account's id.
 */
export type BalanceRedeclared = ChangeRecord<
  "BalanceRedeclared",
  { version: 1; balance: Money }
>;

export function isBalanceRedeclared(
  record: ChangeRecord,
): record is BalanceRedeclared {
  return record.type === "BalanceRedeclared";
}

/** The money a re-declared balance added to (above zero) or took from an Account. */
export type Adjustment = { accountId: string; amount: Money };

/**
 * Every Adjustment, oldest first: each re-declared balance less the
 * Account's balance just before it, in Change Log order. Every slice that
 * counts Adjustments reads them through this. Expects records oldest first,
 * as `readAll` returns them.
 */
export function adjustments(
  records: readonly ChangeRecord[],
): readonly Adjustment[] {
  let found = adjustmentsBySnapshot.get(records);
  if (!found) {
    found = records.some(isBalanceRedeclared) ? foldAdjustments(records) : [];
    adjustmentsBySnapshot.set(records, found);
  }
  return found;
}

/** Kept per Change Log snapshot, so every query reading the same records folds them once. */
const adjustmentsBySnapshot = new WeakMap<
  readonly ChangeRecord[],
  readonly Adjustment[]
>();

/**
 * Replays every record that moves an Account's balance. A Transaction or
 * Transfer counts as each of its records leaves it: an edit moves the
 * difference, a deletion takes it back out.
 */
function foldAdjustments(records: readonly ChangeRecord[]): Adjustment[] {
  const balances = new Map<string, number>();
  const move = (accountId: string, minorUnits: number) =>
    balances.set(accountId, (balances.get(accountId) ?? 0) + minorUnits);
  /** What each Transaction or Transfer currently does to which Accounts. */
  const effects = new Map<string, [accountId: string, minorUnits: number][]>();
  const replace = (
    subjectId: string,
    now: [accountId: string, minorUnits: number][],
  ) => {
    for (const [accountId, minorUnits] of effects.get(subjectId) ?? []) {
      move(accountId, -minorUnits);
    }
    for (const [accountId, minorUnits] of now) move(accountId, minorUnits);
    effects.set(subjectId, now);
  };
  const found: Adjustment[] = [];
  for (const record of records) {
    if (isAccountOpened(record)) {
      move(record.subjectId, record.payload.openingBalance.minorUnits);
    } else if (isBalanceRedeclared(record)) {
      const { balance } = record.payload;
      const difference =
        balance.minorUnits - (balances.get(record.subjectId) ?? 0);
      move(record.subjectId, difference);
      found.push({
        accountId: record.subjectId,
        amount: money(difference, balance.currency),
      });
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
    }
  }
  return found;
}
