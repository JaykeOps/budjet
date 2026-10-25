import type { Writer } from "../../kernel/change-log";
import { type Currency, isCurrency } from "../../kernel/money";
import { budget } from "./queries";
import type { BudgetCreated } from "./records";

export function createBudget(
  writer: Writer,
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
    { version: 1, currency },
  );
}
