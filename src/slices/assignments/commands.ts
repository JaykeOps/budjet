import type { ChangeLogWriter } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { isBudgetCreated } from "../budget-setup/records";
import { type AssignmentSet, assignmentSubject } from "./records";

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
  { categoryId, month, amount }: AssignmentInput,
): void {
  const budget = writer.changeLog.readAll().findLast(isBudgetCreated);
  if (!budget) throw new Error("Create a Budget first");
  const { currency } = budget.payload;
  if (amount.currency !== currency) {
    throw new RangeError(
      `An Assignment must be in ${currency}, the Budget's currency`,
    );
  }
  writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
    assignmentSubject(categoryId, month),
    "AssignmentSet",
    { version: 1, categoryId, month, amount },
  );
}
