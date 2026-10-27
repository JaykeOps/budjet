import type { ChangeLogWriter, ChangeRecord } from "../../kernel/change-log";
import { formatMoney, type Money } from "../../kernel/money";
import { isBudgetCreated } from "../budget-setup/records";
import { type Account, accounts } from "./queries";
import type {
  AccountClosed,
  AccountKind,
  AccountOpened,
  AccountRenamed,
  BalanceRedeclared,
} from "./records";

/** Adds an Account to the Budget and returns its id. */
export function openAccount(
  writer: ChangeLogWriter,
  {
    name,
    kind,
    openingBalance,
  }: { name: string; kind: AccountKind; openingBalance: Money },
): string {
  const currency = budgetCurrency(writer.changeLog.readAll());
  if (openingBalance.currency !== currency) {
    throw new RangeError(
      `The Opening Balance must be in ${currency}, the Budget's currency`,
    );
  }
  const trimmed = checkedName(name);
  const id = crypto.randomUUID();
  writer.write<AccountOpened["type"], AccountOpened["payload"]>(
    id,
    "AccountOpened",
    { version: 1, name: trimmed, kind, openingBalance },
  );
  return id;
}

/**
 * Records an Account's real balance. budjet keeps the difference from its
 * balance just before as an Adjustment, which goes into or comes out of
 * Ready to Assign.
 */
export function redeclareBalance(
  writer: ChangeLogWriter,
  accountId: string,
  { balance }: { balance: Money },
): void {
  const records = writer.changeLog.readAll();
  const currency = budgetCurrency(records);
  openAccountWith(records, accountId);
  if (balance.currency !== currency) {
    throw new RangeError(
      `A balance must be in ${currency}, the Budget's currency`,
    );
  }
  writer.write<BalanceRedeclared["type"], BalanceRedeclared["payload"]>(
    accountId,
    "BalanceRedeclared",
    { version: 1, balance },
  );
}

/** Gives an Account a new name, open or closed. */
export function renameAccount(
  writer: ChangeLogWriter,
  accountId: string,
  { name }: { name: string },
): void {
  const records = writer.changeLog.readAll();
  budgetCurrency(records);
  if (!accounts(records).some(({ id }) => id === accountId)) {
    throw new RangeError(`No Account ${accountId}`);
  }
  writer.write<AccountRenamed["type"], AccountRenamed["payload"]>(
    accountId,
    "AccountRenamed",
    { version: 1, name: checkedName(name) },
  );
}

/**
 * Closes an Account the user no longer uses. Its balance must be zero, so no
 * money leaves the Budget unnoticed: the user Transfers it out first.
 */
export function closeAccount(writer: ChangeLogWriter, accountId: string): void {
  const records = writer.changeLog.readAll();
  budgetCurrency(records);
  const account = openAccountWith(records, accountId);
  if (account.balance.minorUnits !== 0) {
    throw new RangeError(
      `Transfer the ${formatMoney(account.balance)} in ${account.name} to another Account first: only an Account with a balance of zero can be closed`,
    );
  }
  writer.write<AccountClosed["type"], AccountClosed["payload"]>(
    accountId,
    "AccountClosed",
    { version: 1 },
  );
}

function checkedName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new RangeError("An Account needs a name");
  return trimmed;
}

function budgetCurrency(records: readonly ChangeRecord[]): string {
  const budget = records.findLast(isBudgetCreated);
  if (!budget) throw new Error("Create a Budget first");
  return budget.payload.currency;
}

/** The Account, if it is in the Budget and still open. */
function openAccountWith(
  records: readonly ChangeRecord[],
  accountId: string,
): Account {
  const account = accounts(records).find(({ id }) => id === accountId);
  if (!account) throw new RangeError(`No Account ${accountId}`);
  if (account.closed) throw new RangeError(`${account.name} is closed`);
  return account;
}
