import type { ChangeRecord } from "../../kernel/change-log";
import { formatMoney, money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { available } from "../budget-totals";
import { categoryGroups } from "../categories";

export type HiddenMoneyLine = {
  id: string;
  name: string;
  text: string;
  action: "Move it" | "Cover it";
};

/**
 * A line for each hidden Category whose Available in the Month isn't $0.00, in
 * Budget order, so no money goes missing from view.
 */
export function hiddenWithMoney(
  records: readonly ChangeRecord[],
  month: Month,
): HiddenMoneyLine[] {
  return categoryGroups(records)
    .flatMap(({ categories }) => categories)
    .filter(({ hidden }) => hidden)
    .flatMap(({ id, name }) => {
      const left = available(records, id, month);
      if (!left?.minorUnits) return [];
      return left.minorUnits > 0
        ? {
            id,
            name,
            text: `${name} is hidden and has ${formatMoney(left)} Available.`,
            action: "Move it" as const,
          }
        : {
            id,
            name,
            text: `${name} is hidden and is Overspent by ${formatMoney(
              money(-left.minorUnits, left.currency),
            )}.`,
            action: "Cover it" as const,
          };
    });
}
