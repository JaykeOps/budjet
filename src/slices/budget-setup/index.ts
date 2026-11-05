/** Budget Setup's public interface: queries and the hooks that wrap them. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { type Budget, budget } from "./queries";

export { type Budget, budget };

export function useBudget(): Budget | undefined {
  return useChangeLogQuery(budget);
}
