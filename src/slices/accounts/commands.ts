import type { ChangeRecord, DeviceChangeLog } from "../../kernel/change-log";
import { type AccountId, newId } from "../../kernel/id";
import { formatMoney, type Money } from "../../kernel/money";
import { isBudgetCreated } from "../budget-setup/records";
import { type Account, accounts, adjustments, balanceChecks } from "./queries";
import type {
  AccountClosed,
  AccountKind,
  AccountOpened,
  AccountRenamed,
  BalanceRedeclared,
  RedeclaredBalanceDeleted,
} from "./records";
import { isBalanceRedeclared, isRedeclaredBalanceDeleted } from "./records";

/** Adds an Account to the Budget and returns its id. */
export function openAccount(
  log: DeviceChangeLog,
  {
    name,
    kind,
    openingBalance,
  }: { name: string; kind: AccountKind; openingBalance: Money },
): AccountId {
  const id = newId<AccountId>();
  log
    .write<AccountOpened["type"], AccountOpened["payload"], AccountId>(
      id,
      "AccountOpened",
    )
    .ensure((records) => {
      const currency = budgetCurrency(records);
      if (openingBalance.currency !== currency) {
        throw new RangeError(
          `The Opening Balance must be in ${currency}, the Budget's currency`,
        );
      }
      return checkedName(name);
    })
    .commit((trimmed) => ({ version: 1, name: trimmed, kind, openingBalance }));
  return id;
}

/**
 * Records an Account's real balance. Crownkeep keeps the difference from its
 * balance just before as an Adjustment, which goes into or comes out of
 * Ready to Assign. With no difference it is a Balance check, and nothing moves.
 * Returns the id of the record, which is what `deleteRedeclaredBalance` takes.
 */
export function redeclareBalance(
  log: DeviceChangeLog,
  accountId: AccountId,
  { balance }: { balance: Money },
): string {
  return log
    .write<BalanceRedeclared["type"], BalanceRedeclared["payload"]>(
      accountId,
      "BalanceRedeclared",
    )
    .ensure((records) => {
      const currency = budgetCurrency(records);
      openAccountWith(records, accountId);
      if (balance.currency !== currency) {
        throw new RangeError(
          `A balance must be in ${currency}, the Budget's currency`,
        );
      }
    })
    .commit(() => ({ version: 1, balance })).id;
}

/**
 * Deletes an Adjustment or Balance check, given the id of the record that
 * re-declared the balance. Later Adjustments are measured again from the
 * balance just before them. An Opening Balance is not a re-declared balance, so
 * it can't be deleted; nor can one in a closed Account, whose balance stays zero.
 */
export function deleteRedeclaredBalance(
  log: DeviceChangeLog,
  recordId: string,
): void {
  log
    .write<
      RedeclaredBalanceDeleted["type"],
      RedeclaredBalanceDeleted["payload"]
    >(recordId, "RedeclaredBalanceDeleted")
    .ensure((records) => {
      budgetCurrency(records);
      const redeclared = [
        ...adjustments(records),
        ...balanceChecks(records),
      ].find(({ id }) => id === recordId);
      if (!redeclared) {
        throw new RangeError(`No re-declared balance ${recordId}`);
      }
      openAccountWith(records, redeclared.accountId);
    })
    .commit(() => ({ version: 1 }));
}

/**
 * Undoes `deleteRedeclaredBalance`: the same balance, under a fresh id because a
 * deleted record stays deleted (docs/adr/0006). An Adjustment is measured against
 * the balance just before it, and a balance re-declared now would wipe out
 * everything since, so it goes back to its old place in the Change Log. Returns
 * the new record's id.
 */
export function restoreRedeclaredBalance(
  log: DeviceChangeLog,
  recordId: string,
): string {
  const missing = () =>
    new RangeError(`No deleted re-declared balance ${recordId}`);
  // Read first to find where the balance goes back to; `ensure` then checks.
  const redeclared = log
    .readAll()
    .filter(isBalanceRedeclared)
    .find(({ id }) => id === recordId);
  if (!redeclared) throw missing();
  return log
    .writeAt<BalanceRedeclared["type"], BalanceRedeclared["payload"]>(
      redeclared.timestamp,
      redeclared.subjectId,
      "BalanceRedeclared",
    )
    .ensure((records) => {
      const deleted = records.some(
        (record) =>
          isRedeclaredBalanceDeleted(record) && record.subjectId === recordId,
      );
      if (!deleted) throw missing();
      openAccountWith(records, redeclared.subjectId);
    })
    .commit(() => redeclared.payload).id;
}

/** Gives an Account a new name, open or closed. */
export function renameAccount(
  log: DeviceChangeLog,
  accountId: AccountId,
  { name }: { name: string },
): void {
  log
    .write<AccountRenamed["type"], AccountRenamed["payload"]>(
      accountId,
      "AccountRenamed",
    )
    .ensure((records) => {
      budgetCurrency(records);
      if (!accounts(records).some(({ id }) => id === accountId)) {
        throw new RangeError(`No Account ${accountId}`);
      }
    })
    .commit(() => ({ version: 1, name: checkedName(name) }));
}

/**
 * Closes an Account the user no longer uses. Its balance must be zero, so no
 * money leaves the Budget unnoticed: the user Transfers it out first.
 */
export function closeAccount(log: DeviceChangeLog, accountId: AccountId): void {
  log
    .write<AccountClosed["type"], AccountClosed["payload"]>(
      accountId,
      "AccountClosed",
    )
    .ensure((records) => {
      budgetCurrency(records);
      const account = openAccountWith(records, accountId);
      if (account.balance.minorUnits !== 0) {
        throw new RangeError(
          `Transfer the ${formatMoney(account.balance)} in ${account.name} to another Account first: only an Account with a balance of zero can be closed`,
        );
      }
    })
    .commit(() => ({ version: 1 }));
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
  accountId: AccountId,
): Account {
  const account = accounts(records).find(({ id }) => id === accountId);
  if (!account) throw new RangeError(`No Account ${accountId}`);
  if (account.closed) throw new RangeError(`${account.name} is closed`);
  return account;
}
