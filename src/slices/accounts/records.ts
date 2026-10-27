/**
 * The change records Accounts publishes. Other slices may read them; they are
 * versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";

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
