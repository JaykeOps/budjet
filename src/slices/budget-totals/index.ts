/** Budget Totals' public interface: queries and the hooks that wrap them. It has no UI. */
import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { available, readyToAssign, spending } from "./queries";

export { available, readyToAssign, spending };

export function useReadyToAssign(): Money | undefined {
  return useChangeLogQuery(readyToAssign);
}

export function useSpending(categoryId: string, of: Month): Money | undefined {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => spending(records, categoryId, of),
      [categoryId, of],
    ),
  );
}

export function useAvailable(categoryId: string, of: Month): Money | undefined {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => available(records, categoryId, of),
      [categoryId, of],
    ),
  );
}
