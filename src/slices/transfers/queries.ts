import {
  type ChangeRecord,
  latestBySubject,
  perSnapshot,
} from "../../kernel/change-log";
import {
  isTransferDeleted,
  isTransferEdited,
  isTransferMade,
  type TransferDetails,
  type TransferEdited,
  type TransferMade,
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

/**
 * Every Transfer still in the Budget, by id, with its latest details: the most
 * recent of its records wins, and a deleted Transfer is left out. This is how
 * these records are read, so every slice that reads them agrees. Expects
 * records oldest first, as `readAll` returns them.
 */
export const currentTransfers = perSnapshot(
  (records: readonly ChangeRecord[]): ReadonlyMap<string, TransferDetails> => {
    const latest = latestBySubject(
      records.filter(
        (record) =>
          isTransferMade(record) ||
          isTransferEdited(record) ||
          isTransferDeleted(record),
      ),
    );
    const transfers = new Map<string, TransferDetails>();
    for (const [id, record] of latest) {
      if (isTransferDeleted(record)) continue;
      const { version: _, ...details } = (
        record as TransferMade | TransferEdited
      ).payload;
      transfers.set(id, details);
    }
    return transfers;
  },
);
