import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import {
  accountTransactionList,
  accountTransactions,
  type Transaction,
  type TransactionListEntry,
} from "./queries";

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

/** What an Account's Transaction list shows: its Transactions and Transfers, newest first. */
export function useAccountTransactionList(
  accountId: string,
): TransactionListEntry[] {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) =>
        accountTransactionList(records, accountId),
      [accountId],
    ),
  );
}
