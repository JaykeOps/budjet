/** Budget Setup's public interface: queries, the hooks that wrap them, and its UI. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { type Budget, budget } from "./queries";

export { BudgetSetupForm } from "./BudgetSetupForm";
export { type Budget, budget };

export function useBudget(): Budget | undefined {
  return useChangeLogQuery(budget);
}

let deviceId: string | undefined;

/** This device's id, stamped on every record it writes. Lives only as long as the page for now. */
export function thisDeviceId(): string {
  deviceId ??= crypto.randomUUID();
  return deviceId;
}
