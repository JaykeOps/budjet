/**
 * The change records Budget Setup publishes. Other slices may read them; they
 * are versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import type { ChangeRecord } from "../../kernel/change-log";
import type { Currency } from "../../kernel/money";
import type { Month } from "../../kernel/month";

/**
 * The Budget, kept in one currency. Version 2 also says the Month it starts
 * in, as the creating device's calendar had it, so every device agrees
 * whatever its time zone. Version 1 leaves it to the record's time.
 */
export type BudgetCreated = ChangeRecord<
  "BudgetCreated",
  | { version: 1; currency: Currency }
  | { version: 2; currency: Currency; firstMonth: Month }
>;

export function isBudgetCreated(record: ChangeRecord): record is BudgetCreated {
  return record.type === "BudgetCreated";
}
