/**
 * The change records Assignments publishes. Other slices may read them; they
 * are versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";

/**
 * The Assignment for one Category in one Month. Its subject is that Category
 * in that Month (see `assignmentSubject`), so the latest record for it wins.
 */
export type AssignmentSet = ChangeRecord<
  "AssignmentSet",
  { version: 1; categoryId: string; month: Month; amount: Money }
>;

export function isAssignmentSet(record: ChangeRecord): record is AssignmentSet {
  return record.type === "AssignmentSet";
}

/** The subject id of a Category's Assignment in a Month. */
export function assignmentSubject(categoryId: string, month: Month): string {
  return `${categoryId}/${month}`;
}
