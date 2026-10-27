import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { assignmentSubject, isAssignmentSet } from "./records";

/**
 * A Category's Assignment in a Month: the most recently set one, or undefined
 * when none has been set. Expects records oldest first, as `readAll` returns them.
 */
export function assignment(
  records: readonly ChangeRecord[],
  categoryId: string,
  month: Month,
): Money | undefined {
  const subject = assignmentSubject(categoryId, month);
  return records
    .filter(isAssignmentSet)
    .findLast((record) => record.subjectId === subject)?.payload.amount;
}
