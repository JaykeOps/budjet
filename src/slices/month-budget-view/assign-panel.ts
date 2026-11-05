import { addMoney, type Money, money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { categoryRow } from "./category-row";
import {
  assignPreview,
  breakdown,
  type SheetCategory,
  suggestions,
} from "./category-sheet";

/**
 * What the panel beside the Assigned column says about the focused row, as it
 * would be with what's typed there. Below zero reads as saving will: $0.00 plus
 * a Take-back. Suggestions come from what's saved, because they replace what's typed.
 */
export function assignPanel(
  category: SheetCategory,
  ready: Money,
  typed: Money | undefined,
  of: Month,
) {
  const { row } = category;
  const amount = typed ?? row.assigned;
  const { readyToAssignAfter, note } = assignPreview(
    category,
    ready,
    amount,
    of,
  );
  const changed = amount.minorUnits !== row.assigned.minorUnits;
  const zero = money(0, amount.currency);
  const below = money(Math.max(0, -amount.minorUnits), amount.currency);
  return {
    lines: breakdown(
      categoryRow({
        ...row,
        takenBack: addMoney(row.takenBack, below),
        assigned: amount.minorUnits < 0 ? zero : amount,
      }),
      of,
    ),
    note,
    readyToAssign: changed
      ? { label: "Ready to Assign after", amount: readyToAssignAfter }
      : { label: "Ready to Assign is", amount: ready },
    suggestions: suggestions(category, ready, of),
  };
}
