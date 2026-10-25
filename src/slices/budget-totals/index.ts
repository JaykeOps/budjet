/** Budget Totals' public interface: queries and the hooks that wrap them. It has no UI. */
import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import {
  assignedAfter,
  available,
  categoryUsed,
  type OverspentCategory,
  overspent,
  readyToAssign,
  spending,
} from "./queries";

export {
  assignedAfter,
  available,
  categoryUsed,
  type OverspentCategory,
  overspent,
  readyToAssign,
  spending,
};

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

export function useOverspent(of: Month): OverspentCategory[] | undefined {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => overspent(records, of),
      [of],
    ),
  );
}
