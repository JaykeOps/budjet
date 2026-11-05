import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import type { Currency } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import {
  accountTransactions,
  type KnownPayee,
  knownPayees,
  payees,
  type Transaction,
} from "./queries";
import { categoryChoices } from "./record-flow";
import { type Statement, statements } from "./statements";

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

/** The Statements of one Account, or of every Account when none is named. */
export function useStatements(accountId?: string): Statement[] {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => statements(records, accountId),
      [accountId],
    ),
  );
}

/** Every Payee used before, for suggesting as the user types one. */
export function usePayees(): string[] {
  return useChangeLogQuery(payees);
}

/** Every Payee used before, with the Category and Account it can fill in. */
export function useKnownPayees(): KnownPayee[] {
  return useChangeLogQuery(knownPayees);
}

/** What money can be recorded against in a Month. */
export function useCategoryChoices(of: Month, currency: Currency) {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) =>
        categoryChoices(records, of, currency),
      [of, currency],
    ),
  );
}
