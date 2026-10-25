import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { accountTransactions, type Transaction } from "./queries";

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
