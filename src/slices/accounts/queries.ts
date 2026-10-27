import type { ChangeRecord } from "../../kernel/change-log";
import { addMoney, type Money, money, subtractMoney } from "../../kernel/money";
import { isBudgetCreated } from "../budget-setup/records";
import { currentTransactions } from "../transactions/records";
import { currentTransfers } from "../transfers/records";
import { type AccountKind, isAccountOpened } from "./records";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  closed: boolean;
  balance: Money;
};

/**
 * Every Account, in the order they were opened, with its balance: its Opening
 * Balance plus money coming in less money going out, counting each
 * Transaction as last edited, plus Transfers in less Transfers out.
 * Adjustments join it as that slice arrives.
 */
export function accounts(records: readonly ChangeRecord[]): Account[] {
  const byId = new Map<string, Account>();
  for (const record of records) {
    if (isAccountOpened(record)) {
      byId.set(record.subjectId, {
        id: record.subjectId,
        name: record.payload.name,
        kind: record.payload.kind,
        closed: false,
        balance: record.payload.openingBalance,
      });
    }
  }
  for (const { accountId, amount } of currentTransactions(records)) {
    const account = byId.get(accountId);
    if (account) account.balance = addMoney(account.balance, amount);
  }
  for (const { fromAccountId, toAccountId, amount } of currentTransfers(
    records,
  ).values()) {
    const from = byId.get(fromAccountId);
    if (from) from.balance = subtractMoney(from.balance, amount);
    const to = byId.get(toAccountId);
    if (to) to.balance = addMoney(to.balance, amount);
  }
  return [...byId.values()];
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
