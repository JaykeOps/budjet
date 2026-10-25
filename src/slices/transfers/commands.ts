import type { ChangeLogWriter, ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import { monthOf } from "../../kernel/month";
import { accounts } from "../accounts";
import { isBudgetCreated } from "../budget-setup/records";
import {
  currentTransfers,
  type TransferDeleted,
  type TransferDetails,
  type TransferEdited,
  type TransferMade,
} from "./records";

export type TransferInput = {
  fromAccountId: string;
  toAccountId: string;
  /** A calendar date, "YYYY-MM-DD". */
  date: string;
  /** Above zero: the money that leaves `fromAccountId` for `toAccountId`. */
  amount: Money;
  memo?: string;
};

/** Moves money from one open Account to another and returns the Transfer's id. */
export function makeTransfer(
  writer: ChangeLogWriter,
  input: TransferInput,
): string {
  const details = validTransfer(writer.changeLog.readAll(), input);
  const id = crypto.randomUUID();
  writer.write<TransferMade["type"], TransferMade["payload"]>(
    id,
    "TransferMade",
    { version: 1, ...details },
  );
  return id;
}

/** Replaces a Transfer's details. The same rules apply as when making one. */
export function editTransfer(
  writer: ChangeLogWriter,
  id: string,
  input: TransferInput,
): void {
  const records = writer.changeLog.readAll();
  requireTransfer(records, id);
  const details = validTransfer(records, input);
  writer.write<TransferEdited["type"], TransferEdited["payload"]>(
    id,
    "TransferEdited",
    { version: 1, ...details },
  );
}

/** Takes a Transfer out of the Budget. */
export function deleteTransfer(writer: ChangeLogWriter, id: string): void {
  requireTransfer(writer.changeLog.readAll(), id);
  writer.write<TransferDeleted["type"], TransferDeleted["payload"]>(
    id,
    "TransferDeleted",
    { version: 1 },
  );
}

function requireTransfer(records: readonly ChangeRecord[], id: string): void {
  if (!currentTransfers(records).has(id)) {
    throw new RangeError(`No Transfer ${id}`);
  }
}

/** The Transfer's details as they are recorded, or an error saying why it can't be made. */
function validTransfer(
  records: readonly ChangeRecord[],
  { fromAccountId, toAccountId, date, amount, memo }: TransferInput,
): TransferDetails {
  const budget = records.findLast(isBudgetCreated);
  if (!budget) throw new Error("Create a Budget first");
  const { currency } = budget.payload;
  if (fromAccountId === toAccountId) {
    throw new RangeError(
      "A Transfer moves money between two different Accounts",
    );
  }
  const all = accounts(records);
  for (const accountId of [fromAccountId, toAccountId]) {
    const account = all.find(({ id }) => id === accountId);
    if (!account) throw new RangeError(`No Account ${accountId}`);
    if (account.closed) {
      throw new RangeError(`${account.name} is closed`);
    }
  }
  monthOf(date);
  if (amount.currency !== currency) {
    throw new RangeError(
      `A Transfer must be in ${currency}, the Budget's currency`,
    );
  }
  if (amount.minorUnits <= 0) {
    throw new RangeError("A Transfer needs an amount above zero");
  }
  const trimmedMemo = memo?.trim();
  return {
    fromAccountId,
    toAccountId,
    date,
    amount,
    ...(trimmedMemo && { memo: trimmedMemo }),
  };
}
