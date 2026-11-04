import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { assignmentSubject, currentAssignments } from "./records";

/**
 * A Category's Assignment in a Month: the most recently set one, never below
 * zero, or undefined when none has been set. Expects records oldest first, as
 * `readAll` returns them.
 */
export function assignment(
  records: readonly ChangeRecord[],
  categoryId: string,
  month: Month,
): Money | undefined {
  return currentAssignments(records).get(assignmentSubject(categoryId, month))
    ?.assigned;
}

/**
 * The total taken back from what a Category carried forward into a Month, or
 * undefined when none has been. Expects records oldest first, as `readAll`
 * returns them.
 */
export function takeBack(
  records: readonly ChangeRecord[],
  categoryId: string,
  month: Month,
): Money | undefined {
  return currentAssignments(records).get(assignmentSubject(categoryId, month))
    ?.takenBack;
}
