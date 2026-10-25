import type { ChangeRecord } from "../../kernel/change-log";
import type { Currency } from "../../kernel/money";
import { currentMonth, type Month } from "../../kernel/month";
import { isBudgetCreated } from "./records";

export type Budget = {
  id: string;
  currency: Currency;
  /** The Month the Budget was created in; it has no earlier Months. */
  firstMonth: Month;
};

/** The Budget, or undefined before one is created. */
export function budget(records: readonly ChangeRecord[]): Budget | undefined {
  const created = records.findLast(isBudgetCreated);
  return (
    created && {
      id: created.subjectId,
      currency: created.payload.currency,
      firstMonth: currentMonth(new Date(created.timestamp.wallTime)),
    }
  );
}
