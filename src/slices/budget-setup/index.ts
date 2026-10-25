/** Budget Setup's public interface: queries, the hooks that wrap them, and its UI. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { type Budget, budget } from "./queries";

export { BudgetSetupForm } from "./BudgetSetupForm";
export { type Budget, budget };

export function useBudget(): Budget | undefined {
  return useChangeLogQuery(budget);
}
