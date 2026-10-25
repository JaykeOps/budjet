/** Accounts' public interface: queries, the hooks that wrap them, and its UI. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import {
  type Account,
  type Adjustment,
  accountBalance,
  accounts,
  accountsTotal,
  adjustments,
} from "./queries";

export { AccountsScreen } from "./AccountsScreen";
export { OpenAccountForm, type OpenAccountInput } from "./OpenAccountForm";
export type { AccountKind } from "./records";
export {
  type Account,
  type Adjustment,
  accountBalance,
  accounts,
  accountsTotal,
  adjustments,
};

export function useAccounts(): Account[] {
  return useChangeLogQuery(accounts);
}
