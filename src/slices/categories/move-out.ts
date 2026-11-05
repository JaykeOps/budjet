import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { assignmentsAfter, available, readyToAssign } from "../budget-totals";
import { categoryGroups } from "./queries";

export type MoveOutChoices = {
  /** The Category's Available: what has to move, or to be covered if below zero. */
  left: Money;
  readyToAssign: Money;
  /** Its Assignments in later Months, which hiding clears. */
  later: { month: Month; amount: Money }[];
  /** The visible Categories that can take it or, when covering, give all of it. */
  others: { id: string; name: string; groupName: string; available: Money }[];
};

/** Where a Category's Available in `month` can go. Undefined before a Budget exists. */
export function moveOutChoices(
  records: readonly ChangeRecord[],
  categoryId: string,
  month: Month,
): MoveOutChoices | undefined {
  const left = available(records, categoryId, month);
  const ready = readyToAssign(records);
  if (!left || !ready) return undefined;
  const others = categoryGroups(records).flatMap(
    ({ name: groupName, categories }) =>
      categories
        .filter(({ id, hidden }) => id !== categoryId && !hidden)
        .map(({ id, name }) => ({
          id,
          name,
          groupName,
          available: available(records, id, month) ?? left,
        })),
  );
  return {
    left,
    readyToAssign: ready,
    later: assignmentsAfter(records, categoryId, month),
    others:
      left.minorUnits > 0
        ? others
        : others.filter(
            ({ available }) => available.minorUnits >= -left.minorUnits,
          ),
  };
}
