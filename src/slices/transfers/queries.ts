import type { ChangeRecord } from "../../kernel/change-log";
import {
  currentTransfers,
  isTransferMade,
  type TransferDetails,
} from "./records";

export type Transfer = { id: string } & TransferDetails;

/**
 * Every Transfer in the Budget, newest date first. On the same date the most
 * recently made comes first. Expects records oldest first, as `readAll`
 * returns them.
 */
export function transfers(records: readonly ChangeRecord[]): Transfer[] {
  const current = currentTransfers(records);
  return records
    .filter(isTransferMade)
    .flatMap(({ subjectId }) => {
      const details = current.get(subjectId);
      return details ? [{ id: subjectId, ...details }] : [];
    })
    .reverse()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
