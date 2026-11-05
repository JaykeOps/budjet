/** Accounts' public interface: queries, the hooks that wrap them, and its UI. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import {
  type Account,
  type Adjustment,
  accountBalance,
  accounts,
  accountsTotal,
  adjustments,
  type BalanceCheck,
  balanceChecks,
  type OpeningBalance,
  openingBalances,
} from "./queries";

export { AccountPage } from "./AccountPage";
export { AccountsTab } from "./AccountsTab";
export {
  AddAccountSheet,
  OpenAccountForm,
  type OpenAccountInput,
} from "./OpenAccountForm";
export type { AccountKind } from "./records";
export {
  type Account,
  type Adjustment,
  accountBalance,
  accounts,
  accountsTotal,
  adjustments,
  type BalanceCheck,
  balanceChecks,
  type OpeningBalance,
  openingBalances,
};

export function useAccounts(): Account[] {
  return useChangeLogQuery(accounts);
}
