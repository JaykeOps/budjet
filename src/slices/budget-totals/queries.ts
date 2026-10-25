import { type ChangeRecord, latestBySubject } from "../../kernel/change-log";
import { addMoney, type Money, money, subtractMoney } from "../../kernel/money";
import { isAccountOpened } from "../accounts/records";
import { isAssignmentSet } from "../assignments/records";
import { isBudgetCreated } from "../budget-setup/records";

/**
 * The money with no job yet: every Opening Balance, less every Assignment in
 * every Month. Undefined before a Budget exists. Can go below zero.
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
    }
  }
  for (const assigned of latestBySubject(
    records.filter(isAssignmentSet),
  ).values()) {
    total = subtractMoney(total, assigned.payload.amount);
  }
  return total;
}
