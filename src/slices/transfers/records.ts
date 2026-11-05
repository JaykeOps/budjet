/**
 * The change records Transfers publishes. Other slices may read them; they are
 * versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import {
  type ChangeRecord,
  latestBySubject,
  perSnapshot,
} from "../../kernel/change-log";
import type { Money } from "../../kernel/money";

/** What a Transfer says: money moved from one Account to another on a calendar date. */
export type TransferDetails = {
  fromAccountId: string;
  toAccountId: string;
  /** A calendar date, "YYYY-MM-DD". */
  date: string;
  /** Always above zero: it leaves `fromAccountId` and arrives in `toAccountId`. */
  amount: Money;
  memo?: string;
};

/**
 * Money moved from one Account to another. It has no Category and leaves
 * Ready to Assign unchanged. Its subject is the Transfer's id.
 */
export type TransferMade = ChangeRecord<
  "TransferMade",
  {
    version: 1;
    /**
     * The deleted Transfer that Undo brought back as this new one, whose place
     * in a list it takes. Its money counts from now, as any record's does.
     */
    restores?: string;
  } & TransferDetails
>;

/** A Transfer's details replaced as a whole. Its subject is the Transfer's id. */
export type TransferEdited = ChangeRecord<
  "TransferEdited",
  { version: 1 } & TransferDetails
>;

/** A Transfer taken out of the Budget. Its subject is the Transfer's id. */
export type TransferDeleted = ChangeRecord<"TransferDeleted", { version: 1 }>;

export function isTransferMade(record: ChangeRecord): record is TransferMade {
  return record.type === "TransferMade";
}

export function isTransferEdited(
  record: ChangeRecord,
): record is TransferEdited {
  return record.type === "TransferEdited";
}

export function isTransferDeleted(
  record: ChangeRecord,
): record is TransferDeleted {
  return record.type === "TransferDeleted";
}

/**
 * Every Transfer still in the Budget, by id, with its latest details: the most
 * recent of its records wins (docs/adr/0004), and a deleted Transfer is left
 * out whatever else is written about it (docs/adr/0006). This is how these
 * records are read, so every slice that reads them agrees. Expects records
 * oldest first, as `readAll` returns them.
 */
export const currentTransfers = perSnapshot(
  (records: readonly ChangeRecord[]): ReadonlyMap<string, TransferDetails> => {
    const deleted = new Set(
      records.filter(isTransferDeleted).map(({ subjectId }) => subjectId),
    );
    const latest = latestBySubject(
      records.filter(
        (record): record is TransferMade | TransferEdited =>
          isTransferMade(record) || isTransferEdited(record),
      ),
    );
    const transfers = new Map<string, TransferDetails>();
    for (const [id, { payload }] of latest) {
      if (deleted.has(id)) continue;
      const { fromAccountId, toAccountId, date, amount, memo } = payload;
      transfers.set(id, {
        fromAccountId,
        toAccountId,
        date,
        amount,
        ...(memo !== undefined && { memo }),
      });
    }
    return transfers;
  },
);
