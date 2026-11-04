import type { ChangeLogWriter } from "../kernel/change-log";
import type { Currency } from "../kernel/money";
import type { OpenAccountInput } from "../slices/accounts";
import { openAccount } from "../slices/accounts/commands";
import { createBudget } from "../slices/budget-setup/commands";
import { addStarterSet } from "../slices/categories/commands";

export type CategoriesChoice = "starter" | "blank";

/**
 * Ends first run: the only place setup writes anything. Checks every answer
 * first, because a refusal part way through would leave half a Budget.
 */
export function openMyBudget(
  writer: ChangeLogWriter,
  {
    currency,
    categories,
    accounts,
  }: {
    currency: Currency;
    categories: CategoriesChoice;
    accounts: readonly OpenAccountInput[];
  },
): void {
  if (accounts.length === 0) {
    throw new RangeError("A Budget needs at least one Account");
  }
  for (const { name, openingBalance } of accounts) {
    if (!name.trim()) throw new RangeError("An Account needs a name");
    if (openingBalance.currency !== currency) {
      throw new RangeError(`${name} must be in ${currency}`);
    }
  }

  createBudget(writer, { currency });
  if (categories === "starter") addStarterSet(writer);
  for (const account of accounts) openAccount(writer, account);
}
