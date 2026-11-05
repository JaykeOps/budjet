import { formatMoney } from "../../kernel/money";
import { OpenableSheet } from "../../ui/Sheet";
import { useAccounts } from "../accounts";
import { shortDate, useDescribe } from "./History";
import styles from "./History.module.css";
import type { TransactionListEntry } from "./queries";

/** What a row that only reads did, and why it only reads. */
function explanation(entry: TransactionListEntry, name: string) {
  switch (entry.kind) {
    case "adjustment":
      return `The difference went ${entry.amount.minorUnits < 0 ? "out of" : "into"} Ready to Assign.`;
    case "balance-check":
      return "Nothing moved.";
    case "opening-balance":
      return `What ${name} held when you added it.`;
    default:
      return undefined;
  }
}

/**
 * A row that can't be edited, as a sheet on a phone: an Adjustment or Balance
 * check, which can be deleted; an Opening Balance, which can't; and anything
 * touching a closed Account, which stays as it is.
 */
export function EntrySheet({
  entry,
  closedAccountName,
  onClose,
  onDelete,
}: {
  entry?: TransactionListEntry;
  closedAccountName?: string;
  onClose: () => void;
  onDelete: (entry: TransactionListEntry) => void;
}) {
  return (
    <OpenableSheet
      title={entry ? sheetTitle(entry) : ""}
      isOpen={entry !== undefined}
      onClose={onClose}
    >
      {(close) =>
        entry && (
          <Details
            entry={entry}
            closedAccountName={closedAccountName}
            onDelete={() => {
              onDelete(entry);
              close();
            }}
          />
        )
      }
    </OpenableSheet>
  );
}

export function sheetTitle({ kind }: TransactionListEntry): string {
  return {
    transaction: "Transaction",
    transfer: "Transfer",
    adjustment: "Adjustment",
    "balance-check": "Balance check",
    "opening-balance": "Opening Balance",
  }[kind];
}

export function Details({
  entry,
  closedAccountName,
  onDelete,
}: {
  entry: TransactionListEntry;
  closedAccountName?: string;
  onDelete: () => void;
}) {
  const { title, detail, amount } = useDescribe()(entry);
  const account = useAccounts().find(
    ({ id }) => "accountId" in entry && id === entry.accountId,
  );
  const canDelete =
    !closedAccountName &&
    (entry.kind === "adjustment" || entry.kind === "balance-check");
  const explained = explanation(entry, account?.name ?? "");
  const named = entry.kind === "transaction" || entry.kind === "transfer";
  return (
    <>
      {amount && <p className={styles.sheetAmount}>{formatMoney(amount)}</p>}
      <p className={styles.date}>{shortDate(entry.date)}</p>
      <p>
        {named && <span className={styles.title}>{title}</span>}{" "}
        <span className={styles.detail}>{detail}</span>
      </p>
      {explained && <p className={styles.detail}>{explained}</p>}
      {closedAccountName && (
        <p>{closedAccountName} is closed, so this stays as it is.</p>
      )}
      {canDelete && (
        <button type="button" className={styles.delete} onClick={onDelete}>
          Delete
        </button>
      )}
    </>
  );
}
