/**
 * The change records Assignments publishes. Other slices may read them; they
 * are versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import {
  type ChangeRecord,
  deletedSubjects,
  latestBySubject,
  perSnapshot,
} from "../../kernel/change-log";
import { addMoney, type Money, money } from "../../kernel/money";
import type { Month } from "../../kernel/month";

/**
 * The Assignment for one Category in one Month. Its subject is that Category
 * in that Month (see `assignmentSubject`), so the latest record for it wins.
 * Commands no longer store one below zero, but records from before Take-backs
 * can hold one; read them through `currentAssignments`.
 */
export type AssignmentSet = ChangeRecord<
  "AssignmentSet",
  { version: 1; categoryId: string; month: Month; amount: Money }
>;

export function isAssignmentSet(record: ChangeRecord): record is AssignmentSet {
  return record.type === "AssignmentSet";
}

/**
 * The total taken back from what a Category carried forward into a Month. Like
 * `AssignmentSet`, its subject is that Category in that Month and the latest
 * record for it wins.
 */
export type TakeBackSet = ChangeRecord<
  "TakeBackSet",
  { version: 1; categoryId: string; month: Month; amount: Money }
>;

export function isTakeBackSet(record: ChangeRecord): record is TakeBackSet {
  return record.type === "TakeBackSet";
}

/** The subject id of a Category's Assignment or Take-back in a Month. */
export function assignmentSubject(categoryId: string, month: Month): string {
  return `${categoryId}/${month}`;
}

/** A Category's money in a Month: each is undefined until it has been set. */
export type CurrentAssignment = {
  categoryId: string;
  month: Month;
  assigned: Money | undefined;
  takenBack: Money | undefined;
};

/**
 * Every Category's Assignment and Take-back in every Month as they now stand,
 * by `assignmentSubject`: the latest of each wins, and a stored negative
 * Assignment reads as $0 plus a Take-back of the difference. A deleted Category
 * has none, whatever another device wrote for it (docs/adr/0006). Records may
 * import only the kernel, so its delete record is matched by the type it publishes.
 */
export const currentAssignments = perSnapshot(
  (records: readonly ChangeRecord[]): Map<string, CurrentAssignment> => {
    const deleted = deletedSubjects(
      records,
      ({ type }) => type === "CategoryDeleted",
    );
    const current = new Map<string, CurrentAssignment>();
    const entry = (
      subject: string,
      { categoryId, month }: { categoryId: string; month: Month },
    ) => {
      let found = current.get(subject);
      if (!found) {
        found = {
          categoryId,
          month,
          assigned: undefined,
          takenBack: undefined,
        };
        current.set(subject, found);
      }
      return found;
    };
    for (const [subject, { payload }] of latestBySubject(
      records.filter(isTakeBackSet),
    )) {
      entry(subject, payload).takenBack = payload.amount;
    }
    for (const [subject, { payload }] of latestBySubject(
      records.filter(isAssignmentSet),
    )) {
      const found = entry(subject, payload);
      const { amount } = payload;
      if (amount.minorUnits < 0) {
        const difference = money(-amount.minorUnits, amount.currency);
        found.assigned = money(0, amount.currency);
        found.takenBack = found.takenBack
          ? addMoney(found.takenBack, difference)
          : difference;
      } else {
        found.assigned = amount;
      }
    }
    for (const [subject, { categoryId }] of current) {
      if (deleted.has(categoryId)) current.delete(subject);
    }
    return current;
  },
);
