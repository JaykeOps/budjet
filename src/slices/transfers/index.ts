/** Transfers' public interface: queries, the hooks that wrap them, and its UI. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { currentTransfers, type Transfer, transfers } from "./queries";

export type { TransferInput } from "./commands";
export type { TransferDetails } from "./records";
export { TransfersScreen } from "./TransfersScreen";
export { currentTransfers, type Transfer, transfers };

/** Every Transfer in the Budget, newest first. */
export function useTransfers(): Transfer[] {
  return useChangeLogQuery(transfers);
}
