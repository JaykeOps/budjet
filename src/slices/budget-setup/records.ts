/**
 * The change records Budget Setup publishes. Other slices may read them; they
 * are versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import type { ChangeRecord } from "../../kernel/change-log";
import type { Currency } from "../../kernel/money";

export type BudgetCreated = ChangeRecord<
  "BudgetCreated",
  { version: 1; currency: Currency }
>;

export function isBudgetCreated(record: ChangeRecord): record is BudgetCreated {
  return record.type === "BudgetCreated";
}
