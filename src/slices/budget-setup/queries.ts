import type { ChangeRecord } from "../../kernel/change-log";
import type { Currency } from "../../kernel/money";
import { isBudgetCreated } from "./records";

export type Budget = { id: string; currency: Currency };

/** The Budget, or undefined before one is created. */
export function budget(records: readonly ChangeRecord[]): Budget | undefined {
  const created = records.findLast(isBudgetCreated);
  return (
    created && { id: created.subjectId, currency: created.payload.currency }
  );
}
