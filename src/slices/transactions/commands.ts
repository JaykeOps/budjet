import type { ChangeLogWriter, ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import { monthOf } from "../../kernel/month";
import { accounts } from "../accounts";
import { isBudgetCreated } from "../budget-setup/records";
import { categoryGroups } from "../categories";
import {
  currentTransactions,
  type TransactionDeleted,
  type TransactionEdited,
  type TransactionRecorded,
} from "./records";

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
  input: TransactionInput,
): string {
  const id = crypto.randomUUID();
  writer.write<TransactionRecorded["type"], TransactionRecorded["payload"]>(
    id,
    "TransactionRecorded",
    checkedPayload(writer.changeLog.readAll(), input),
  );
  return id;
}

/**
 * Replaces everything a Transaction says, in any Month, under the same rules
 * as recording one.
 */
export function editTransaction(
  writer: ChangeLogWriter,
  id: string,
  input: TransactionInput,
): void {
  const records = writer.changeLog.readAll();
  checkExists(records, id);
  writer.write<TransactionEdited["type"], TransactionEdited["payload"]>(
    id,
    "TransactionEdited",
    checkedPayload(records, input),
  );
}

/** Removes a Transaction, in any Month. */
export function deleteTransaction(writer: ChangeLogWriter, id: string): void {
  checkExists(writer.changeLog.readAll(), id);
  writer.write<TransactionDeleted["type"], TransactionDeleted["payload"]>(
    id,
    "TransactionDeleted",
    { version: 1 },
  );
}

function checkExists(records: readonly ChangeRecord[], id: string): void {
  if (
    !currentTransactions(records).some((transaction) => transaction.id === id)
  ) {
    throw new RangeError(`No Transaction ${id}`);
  }
}

/** The payload for a Transaction that keeps every rule, or the first rule it breaks. */
function checkedPayload(
  records: readonly ChangeRecord[],
  { accountId, date, amount, categoryId, payee, memo }: TransactionInput,
): TransactionRecorded["payload"] {
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

  const trimmedPayee = payee?.trim();
  const trimmedMemo = memo?.trim();
  return {
    version: 1,
    accountId,
    date,
    amount,
    ...(categoryId && { categoryId }),
    ...(trimmedPayee && { payee: trimmedPayee }),
    ...(trimmedMemo && { memo: trimmedMemo }),
  };
}
