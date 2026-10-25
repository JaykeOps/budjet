/** Budget Totals' public interface: queries and the hooks that wrap them. It has no UI. */
import type { Money } from "../../kernel/money";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { readyToAssign } from "./queries";

export { readyToAssign };

export function useReadyToAssign(): Money | undefined {
  return useChangeLogQuery(readyToAssign);
}
