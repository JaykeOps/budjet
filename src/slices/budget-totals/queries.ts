import { type ChangeRecord, latestBySubject } from "../../kernel/change-log";
import { addMoney, type Money, money, subtractMoney } from "../../kernel/money";
import { type Month, monthOf } from "../../kernel/month";
import { isAccountOpened } from "../accounts/records";
import { assignmentSubject, isAssignmentSet } from "../assignments/records";
import { isBudgetCreated } from "../budget-setup/records";
import {
  isTransactionRecorded,
  type TransactionRecorded,
} from "../transactions/records";

/**
 * The money with no job yet: every Opening Balance and all money coming in
 * with no Category, less every Assignment in every Month. Undefined before a Budget exists. Can go below zero.
 */
export function readyToAssign(
  records: readonly ChangeRecord[],
): Money | undefined {
  const budget = records.findLast(isBudgetCreated);
  if (!budget) return undefined;
  let total = money(0, budget.payload.currency);
  for (const record of records) {
    if (isAccountOpened(record)) {
      total = addMoney(total, record.payload.openingBalance);
    } else if (isTransactionRecorded(record) && !record.payload.categoryId) {
      total = addMoney(total, record.payload.amount);
    }
  }
  for (const assigned of latestBySubject(
    records.filter(isAssignmentSet),
  ).values()) {
    total = subtractMoney(total, assigned.payload.amount);
  }
  return total;
}

/**
 * The money that went out of a Category in a Month, as a positive amount.
 * Undefined before a Budget exists.
 */
export function spending(
  records: readonly ChangeRecord[],
  categoryId: string,
  of: Month,
): Money | undefined {
  const budget = records.findLast(isBudgetCreated);
  if (!budget) return undefined;
  let total = money(0, budget.payload.currency);
  for (const { amount } of transactionsIn(records, categoryId, of)) {
    if (amount.minorUnits < 0) total = subtractMoney(total, amount);
  }
  return total;
}

/**
 * The money a Category has to spend in a Month: that Month's Assignment, plus
 * money coming in to it, less money going out of it. Can go below zero.
 * Undefined before a Budget exists.
 */
export function available(
  records: readonly ChangeRecord[],
  categoryId: string,
  of: Month,
): Money | undefined {
  const budget = records.findLast(isBudgetCreated);
  if (!budget) return undefined;
  const subject = assignmentSubject(categoryId, of);
  let total =
    records.filter(isAssignmentSet).findLast((set) => set.subjectId === subject)
      ?.payload.amount ?? money(0, budget.payload.currency);
  for (const { amount } of transactionsIn(records, categoryId, of)) {
    total = addMoney(total, amount);
  }
  return total;
}

/** The payloads of the Transactions in a Category in a Month. */
function transactionsIn(
  records: readonly ChangeRecord[],
  categoryId: string,
  of: Month,
): TransactionRecorded["payload"][] {
  return records
    .filter(isTransactionRecorded)
    .map(({ payload }) => payload)
    .filter(
      (transaction) =>
        transaction.categoryId === categoryId &&
        monthOf(transaction.date) === of,
    );
}
