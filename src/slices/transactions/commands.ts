import type { ChangeLogWriter } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import { monthOf } from "../../kernel/month";
import { accounts } from "../accounts";
import { isBudgetCreated } from "../budget-setup/records";
import { categoryGroups } from "../categories";
import type { TransactionRecorded } from "./records";

export type TransactionInput = {
  accountId: string;
  /** A calendar date, "YYYY-MM-DD". */
  date: string;
  /** Negative for money going out of the Account, positive for money coming in. */
  amount: Money;
  categoryId?: string;
  payee?: string;
  memo?: string;
};

/**
 * Records money going out of or coming in to an Account and returns the
 * Transaction's id. Money going out needs a Category; money coming in without
 * one goes to Ready to Assign.
 */
export function recordTransaction(
  writer: ChangeLogWriter,
  { accountId, date, amount, categoryId, payee, memo }: TransactionInput,
): string {
  const records = writer.changeLog.readAll();
  const budget = records.findLast(isBudgetCreated);
  if (!budget) throw new Error("Create a Budget first");
  const { currency } = budget.payload;
  if (!accounts(records).some(({ id }) => id === accountId)) {
    throw new RangeError(`No Account ${accountId}`);
  }
  monthOf(date);
  if (amount.currency !== currency) {
    throw new RangeError(
      `A Transaction must be in ${currency}, the Budget's currency`,
    );
  }
  if (amount.minorUnits === 0) {
    throw new RangeError("A Transaction needs an amount");
  }
  if (amount.minorUnits < 0 && !categoryId) {
    throw new RangeError("Money going out needs a Category");
  }
  if (
    categoryId &&
    !categoryGroups(records).some(({ categories }) =>
      categories.some(({ id }) => id === categoryId),
    )
  ) {
    throw new RangeError(`No Category ${categoryId}`);
  }

  const id = crypto.randomUUID();
  const trimmedPayee = payee?.trim();
  const trimmedMemo = memo?.trim();
  writer.write<TransactionRecorded["type"], TransactionRecorded["payload"]>(
    id,
    "TransactionRecorded",
    {
      version: 1,
      accountId,
      date,
      amount,
      ...(categoryId && { categoryId }),
      ...(trimmedPayee && { payee: trimmedPayee }),
      ...(trimmedMemo && { memo: trimmedMemo }),
    },
  );
  return id;
}
