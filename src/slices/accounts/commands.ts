import type { ChangeLogWriter } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import { isBudgetCreated } from "../budget-setup/records";
import type { AccountKind, AccountOpened } from "./records";

/** Adds an Account to the Budget and returns its id. */
export function openAccount(
  writer: ChangeLogWriter,
  {
    name,
    kind,
    openingBalance,
  }: { name: string; kind: AccountKind; openingBalance: Money },
): string {
  const budget = writer.changeLog.readAll().findLast(isBudgetCreated);
  if (!budget) throw new Error("Create a Budget first");
  const { currency } = budget.payload;
  if (openingBalance.currency !== currency) {
    throw new RangeError(
      `The Opening Balance must be in ${currency}, the Budget's currency`,
    );
  }
  const trimmed = name.trim();
  if (!trimmed) throw new RangeError("An Account needs a name");

  const id = crypto.randomUUID();
  writer.write<AccountOpened["type"], AccountOpened["payload"]>(
    id,
    "AccountOpened",
    { version: 1, name: trimmed, kind, openingBalance },
  );
  return id;
}
