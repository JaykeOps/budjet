import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { accountTransactions, payees, type Transaction } from "./queries";

/** An Account's Transactions, newest first. */
export function useAccountTransactions(accountId: string): Transaction[] {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) =>
        accountTransactions(records, accountId),
      [accountId],
    ),
  );
}

/** Every Payee used before, for suggesting as the user types one. */
export function usePayees(): string[] {
  return useChangeLogQuery(payees);
}
