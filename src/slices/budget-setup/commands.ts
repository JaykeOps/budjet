import type { DeviceChangeLog } from "../../kernel/change-log";
import { type Currency, isCurrency } from "../../kernel/money";
import { currentMonth } from "../../kernel/month";
import { budget } from "./queries";
import type { BudgetCreated } from "./records";

/** Creates the Budget, starting in this device's current Month. */
export function createBudget(
  log: DeviceChangeLog,
  { currency }: { currency: Currency },
): void {
  if (!isCurrency(currency)) {
    throw new RangeError(`${currency} is not a currency`);
  }
  if (budget(log.readAll())) {
    throw new Error("Crownkeep already has a Budget");
  }
  log.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    crypto.randomUUID(),
    "BudgetCreated",
    { version: 2, currency, firstMonth: currentMonth() },
  );
}
