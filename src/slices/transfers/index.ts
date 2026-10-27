/** Transfers' public interface: queries, the hooks that wrap them, and its UI. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { type Transfer, transfers } from "./queries";

export type { TransferInput } from "./commands";
export { TransfersScreen } from "./TransfersScreen";
export { type Transfer, transfers };

/** Every Transfer in the Budget, newest first. */
export function useTransfers(): Transfer[] {
  return useChangeLogQuery(transfers);
}
