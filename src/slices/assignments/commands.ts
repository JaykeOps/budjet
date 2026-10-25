import { type ChangeLogWriter, latestBySubject } from "../../kernel/change-log";
import { addMoney, type Money, money, subtractMoney } from "../../kernel/money";
import { type Month, previousMonth } from "../../kernel/month";
import { isBudgetCreated } from "../budget-setup/records";
import { assignment } from "./queries";
import {
  type AssignmentSet,
  assignmentSubject,
  isAssignmentSet,
} from "./records";

export type AssignmentInput = {
  categoryId: string;
  month: Month;
  amount: Money;
};

/**
 * Sets a Category's Assignment for a Month, replacing any earlier one. It may
 * be more than Ready to Assign; the Month Budget view warns about that.
 */
export function setAssignment(
  writer: ChangeLogWriter,
  input: AssignmentInput,
): void {
  checkInBudgetCurrency(writer, input.amount);
  write(writer, input);
}

/**
 * Copies last Month's Assignments into `month`, but only for Categories that
 * have no Assignment in `month` yet: one set there is never overwritten.
 */
export function copyLastMonth(
  writer: ChangeLogWriter,
  { month }: { month: Month },
): void {
  const latest = latestBySubject(
    writer.changeLog.readAll().filter(isAssignmentSet),
  );
  const lastMonth = previousMonth(month);
  for (const { payload } of latest.values()) {
    if (payload.month !== lastMonth) continue;
    if (latest.has(assignmentSubject(payload.categoryId, month))) continue;
    setAssignment(writer, {
      categoryId: payload.categoryId,
      month,
      amount: payload.amount,
    });
  }
}

export type MoveMoneyInput = {
  fromCategoryId: string;
  toCategoryId: string;
  month: Month;
  amount: Money;
};

/**
 * Moves money between two Categories in one Month: lowers one Assignment and
 * raises the other by the same amount, just as editing both would. The
 * lowered Assignment may go below zero.
 */
export function moveMoney(
  writer: ChangeLogWriter,
  { fromCategoryId, toCategoryId, month, amount }: MoveMoneyInput,
): void {
  if (fromCategoryId === toCategoryId) {
    throw new RangeError("Move money between two different Categories");
  }
  if (amount.minorUnits <= 0) {
    throw new RangeError("Move an amount more than zero");
  }
  checkInBudgetCurrency(writer, amount);
  const records = writer.changeLog.readAll();
  const assigned = (categoryId: string) =>
    assignment(records, categoryId, month) ?? money(0, amount.currency);
  const from = subtractMoney(assigned(fromCategoryId), amount);
  const to = addMoney(assigned(toCategoryId), amount);
  write(writer, { categoryId: fromCategoryId, month, amount: from });
  write(writer, { categoryId: toCategoryId, month, amount: to });
}

function checkInBudgetCurrency(writer: ChangeLogWriter, amount: Money): void {
  const budget = writer.changeLog.readAll().findLast(isBudgetCreated);
  if (!budget) throw new Error("Create a Budget first");
  const { currency } = budget.payload;
  if (amount.currency !== currency) {
    throw new RangeError(
      `An Assignment must be in ${currency}, the Budget's currency`,
    );
  }
}

function write(
  writer: ChangeLogWriter,
  { categoryId, month, amount }: AssignmentInput,
): void {
  writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
    assignmentSubject(categoryId, month),
    "AssignmentSet",
    { version: 1, categoryId, month, amount },
  );
}
