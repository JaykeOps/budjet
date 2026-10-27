/** Accounts' public interface: queries, the hooks that wrap them, and its UI. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import {
  type Account,
  accountBalance,
  accounts,
  accountsTotal,
} from "./queries";

export { AccountsScreen } from "./AccountsScreen";
export { OpenAccountForm, type OpenAccountInput } from "./OpenAccountForm";
export type { AccountKind } from "./records";
export { type Account, accountBalance, accounts, accountsTotal };

export function useAccounts(): Account[] {
  return useChangeLogQuery(accounts);
}
