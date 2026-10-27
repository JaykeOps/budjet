/**
 * The change records Transfers publishes. Other slices may read them; they are
 * versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import type { ChangeRecord } from "../../kernel/change-log";
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
  { version: 1 } & TransferDetails
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
