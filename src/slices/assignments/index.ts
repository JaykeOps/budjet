/** Assignments' public interface: queries and the hooks that wrap them. */
import { useCallback } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import type { CategoryId } from "../../kernel/id";
import type { Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { assignment, takeBack } from "./queries";

export { assignment, takeBack };

export function useAssignment(
  categoryId: CategoryId,
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

export function useTakeBack(
  categoryId: CategoryId,
  month: Month,
): Money | undefined {
  return useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) =>
        takeBack(records, categoryId, month),
      [categoryId, month],
    ),
  );
}
