import type { ChangeRecord } from "../../kernel/change-log";
import { addMoney, type Money, money } from "../../kernel/money";
import { isBudgetCreated } from "../budget-setup/records";
import { type AccountKind, isAccountOpened } from "./records";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  closed: boolean;
  balance: Money;
};

/** Every Account, in the order they were opened, with its balance. */
export function accounts(records: readonly ChangeRecord[]): Account[] {
  return records.filter(isAccountOpened).map((opened) => ({
    id: opened.subjectId,
    name: opened.payload.name,
    kind: opened.payload.kind,
    closed: false,
    balance: opened.payload.openingBalance,
  }));
}

/**
 * An Account's balance. For now that is its Opening Balance; Transactions,
 * Transfers and Adjustments join it as those slices arrive.
 */
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
