import type { ChangeLogWriter } from "../../kernel/change-log";
import { type Currency, isCurrency } from "../../kernel/money";
import { currentMonth } from "../../kernel/month";
import { budget } from "./queries";
import type { BudgetCreated } from "./records";

/** Creates the Budget, starting in this device's current Month. */
export function createBudget(
  writer: ChangeLogWriter,
  { currency }: { currency: Currency },
): void {
  if (!isCurrency(currency)) {
    throw new RangeError(`${currency} is not a currency`);
  }
  if (budget(writer.changeLog.readAll())) {
    throw new Error("budjet already has a Budget");
  }
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    crypto.randomUUID(),
    "BudgetCreated",
    { version: 2, currency, firstMonth: currentMonth() },
  );
}
