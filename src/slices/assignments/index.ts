/** Assignments' public interface: queries and the hooks that wrap them. */
import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { assignment } from "./queries";

export { assignment };

export function useAssignment(
  categoryId: string,
  month: Month,
): Money | undefined {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) =>
        assignment(records, categoryId, month),
      [categoryId, month],
    ),
  );
}
