import type { ChangeLogWriter } from "../../kernel/change-log";
import { addMoney, type Money, money, subtractMoney } from "../../kernel/money";
import { type Month, previousMonth } from "../../kernel/month";
import { isBudgetCreated } from "../budget-setup/records";
import { assignment } from "./queries";
import {
  type AssignmentSet,
  assignmentSubject,
  type CurrentAssignment,
  currentAssignments,
  isAssignmentSet,
  type TakeBackSet,
} from "./records";

export type AssignmentInput = {
  categoryId: string;
  month: Month;
  amount: Money;
};

/**
 * Sets a Category's Assignment for a Month, replacing any earlier one. It may
 * be more than Ready to Assign; the Month Budget view warns about that. An
 * amount below zero sets it to zero and takes the rest back.
 */
export function setAssignment(
  writer: ChangeLogWriter,
  input: AssignmentInput,
): void {
  checkInBudgetCurrency(writer, input.amount);
  write(writer, input);
}

/**
 * Copies last Month's Assignments above zero into `month`, but only for
 * Categories that have no Assignment in `month` yet: one set there is never
 * overwritten.
 * Categories in `skipping` (the app shell passes the hidden ones; Assignments
 * doesn't know which those are) are left out. Says how many it copied.
 */
export function copyLastMonth(
  writer: ChangeLogWriter,
  { month, skipping = [] }: { month: Month; skipping?: Iterable<string> },
): number {
  const current = currentAssignments(writer.changeLog.readAll());
  const lastMonth = previousMonth(month);
  const skipped = new Set(skipping);
  let copied = 0;
  for (const { categoryId, month: of, assigned } of current.values()) {
    if (of !== lastMonth || !assigned?.minorUnits) continue;
    if (skipped.has(categoryId)) continue;
    if (current.get(assignmentSubject(categoryId, month))?.assigned) continue;
    setAssignment(writer, { categoryId, month, amount: assigned });
    copied++;
  }
  return copied;
}

export type MoveMoneyInput = {
  fromCategoryId: string;
  toCategoryId: string;
  month: Month;
  amount: Money;
};

/**
 * Moves money between two Categories in one Month: lowers one Assignment and
 * raises the other by the same amount, just as editing both would. What the
 * lowered Assignment can't cover is taken back from what it carried forward.
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

/**
 * Writes a Category's Assignment and Take-back in a Month back as they were,
 * for Undo. Only what differs is written, so an Undo leaves alone anything it
 * didn't change.
 */
export function restoreAssignment(
  writer: ChangeLogWriter,
  { categoryId, month, assigned, takenBack }: CurrentAssignment,
): void {
  const budget = writer.changeLog.readAll().findLast(isBudgetCreated);
  if (!budget) throw new Error("Create a Budget first");
  const { currency } = budget.payload;
  const subject = assignmentSubject(categoryId, month);
  const stored = writer.changeLog
    .readAll()
    .filter(isAssignmentSet)
    .findLast((record) => record.subjectId === subject)?.payload;
  // Compared as stored: one below zero has to be replaced to stop counting.
  const storedNow = stored?.cleared ? undefined : stored?.amount.minorUnits;
  if (storedNow !== assigned?.minorUnits) {
    writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
      subject,
      "AssignmentSet",
      {
        version: 1,
        categoryId,
        month,
        amount: money(assigned?.minorUnits ?? 0, currency),
        ...(assigned ? {} : { cleared: true as const }),
      },
    );
  }
  const now = currentAssignments(writer.changeLog.readAll()).get(subject);
  if ((now?.takenBack?.minorUnits ?? 0) !== (takenBack?.minorUnits ?? 0)) {
    writer.write<TakeBackSet["type"], TakeBackSet["payload"]>(
      subject,
      "TakeBackSet",
      {
        version: 1,
        categoryId,
        month,
        amount: money(takenBack?.minorUnits ?? 0, currency),
      },
    );
  }
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

/**
 * Writes an Assignment. An amount below zero is written as zero, with the part
 * beyond it added to the Month's Take-back. A Take-back is written only when it
 * changes, so an Assignment on one device can't undo a Take-back on another.
 */
function write(
  writer: ChangeLogWriter,
  { categoryId, month, amount }: AssignmentInput,
): void {
  const records = writer.changeLog.readAll();
  const subject = assignmentSubject(categoryId, month);
  const beyond = Math.max(0, -amount.minorUnits);
  const replaced = records
    .filter(isAssignmentSet)
    .findLast((record) => record.subjectId === subject)?.payload.amount;
  // A stored negative Assignment holds a Take-back only until it's replaced.
  if (beyond > 0 || (replaced && replaced.minorUnits < 0)) {
    const earlier = currentAssignments(records).get(subject)?.takenBack;
    writer.write<TakeBackSet["type"], TakeBackSet["payload"]>(
      subject,
      "TakeBackSet",
      {
        version: 1,
        categoryId,
        month,
        amount: money((earlier?.minorUnits ?? 0) + beyond, amount.currency),
      },
    );
  }
  writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
    subject,
    "AssignmentSet",
    {
      version: 1,
      categoryId,
      month,
      amount: money(Math.max(0, amount.minorUnits), amount.currency),
    },
  );
}
