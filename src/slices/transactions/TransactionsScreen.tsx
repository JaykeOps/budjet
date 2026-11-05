import { type ReactNode, useId, useState } from "react";
import type { Currency } from "../../kernel/money";
import { EmptyState } from "../../ui/EmptyState";
import type { MenuAction } from "../../ui/Menu";
import { type Account, useAccounts } from "../accounts";
import { type TransferInput, TransferSheet } from "../transfers";
import type { TransactionInput } from "./commands";
import { EntrySheet } from "./EntrySheet";
import { History } from "./History";
import styles from "./History.module.css";
import { useStatements } from "./hooks";
import { InPlaceRow } from "./InPlaceRow";
import type { TransactionListEntry, TransferEntry } from "./queries";
import { RecordTransactionSheet } from "./RecordTransactionSheet";
import { type Showing, ShowingPicker } from "./ShowingPicker";

/** What the app shell does with the rows of a history. */
type HistoryActions = {
  currency: Currency;
  onEdit: (id: string, input: TransactionInput) => void;
  onDelete: (id: string) => void;
  /** `what` names it for a toast: "Adjustment" or "Balance check". */
  onDeleteRedeclaredBalance: (recordId: string, what: string) => void;
  onEditTransfer: (id: string, input: TransferInput) => void;
  onDeleteTransfer: (id: string) => void;
};

/**
 * History as Month Statements, of every Account or the one the app shell says
 * it is showing, with a way to change each row, unless a closed Account is
 * involved. The app shell keeps what's showing, gives the row that records, and
 * decides what editing and deleting do; an error it throws is shown on the row.
 * Below the rows, an empty state says what to do next when there's no open
 * Account or nothing but Opening Balances.
 */
export function TransactionsScreen({
  showing,
  onShow,
  recordRow,
  onRecordFirst,
  onAddAccount,
  ...actions
}: HistoryActions & {
  showing: Showing;
  onShow: (showing: Showing) => void;
  /** The row that records on desktop, if it's open. */
  recordRow: ReactNode;
  /** The empty state's way to start recording, into the Account showing if any. */
  onRecordFirst: (accountId?: string) => void;
  onAddAccount: () => void;
}) {
  const headingId = useId();
  const accounts = useAccounts();
  const openAccounts = accounts.filter(({ closed }) => !closed);
  const account = accounts.find(({ id }) => id === showing.accountId);
  const all = useStatements(account?.id);
  const statements = showing.month
    ? all.filter(({ month }) => month === showing.month)
    : all;
  const rows = useRowChanges(actions);

  const onlyOpeningBalances = all.every(({ entries }) =>
    entries.every(({ kind }) => kind === "opening-balance"),
  );
  return (
    <>
      <h1 id={headingId} className={styles.screenTitle}>
        {account ? (
          account.name
        ) : (
          <>
            <span className={styles.onlyOnPhone}>Activity</span>
            <span className={styles.notOnPhone}>All Accounts</span>
          </>
        )}
      </h1>
      <section aria-labelledby={headingId} className={styles.screen}>
        {account?.closed && (
          <p>
            Closed. Its history stays here, and it takes no new Transactions or
            Transfers.
          </p>
        )}
        <ShowingPicker
          showing={{ accountId: account?.id, month: showing.month }}
          onShow={onShow}
        />
        {!account?.closed && recordRow}
        {statements.length === 0 ? (
          <p>Nothing here. Try another Month.</p>
        ) : (
          <History
            label={`History of ${account?.name ?? "All Accounts"}`}
            statements={statements}
            accountId={account?.id}
            askedMonth={showing.month}
            actionsFor={rows.actionsFor}
            onOpen={rows.open}
            inPlace={rows.inPlace}
          />
        )}
        {!account && openAccounts.length === 0 ? (
          <EmptyState
            plain
            actions={
              <button type="button" data-primary onClick={onAddAccount}>
                Add an Account
              </button>
            }
          >
            Nothing here yet. Add an Account, and everything that moves through
            it shows up here.
          </EmptyState>
        ) : (
          !account?.closed &&
          onlyOpeningBalances && (
            <EmptyState
              plain
              actions={
                <button
                  type="button"
                  data-primary
                  onClick={() => onRecordFirst(account?.id)}
                >
                  Record a Transaction
                </button>
              }
            >
              Nothing recorded yet. Record what you spend, and it shows up here.
            </EmptyState>
          )
        )}
        {rows.sheets}
      </section>
    </>
  );
}

/** One open or closed Account's Statements, for its page, with each row's changes. */
export function AccountHistory({
  account,
  ...actions
}: HistoryActions & { account: Account }) {
  const statements = useStatements(account.id);
  const rows = useRowChanges(actions);
  return (
    <>
      <History
        label={`History of ${account.name}`}
        statements={statements}
        accountId={account.id}
        actionsFor={rows.actionsFor}
        onOpen={rows.open}
        inPlace={rows.inPlace}
      />
      {rows.sheets}
    </>
  );
}

/**
 * What each history row leads to when tapped: on a phone a sheet, and on desktop
 * the row itself, open where it sits. Desktop's More menu offers Delete.
 */
function useRowChanges({
  currency,
  onEdit,
  onDelete,
  onDeleteRedeclaredBalance,
  onEditTransfer,
  onDeleteTransfer,
}: HistoryActions) {
  const closed = useAccounts().filter(({ closed }) => closed);
  const [editingTransfer, setEditingTransfer] = useState<TransferEntry>();
  const [opened, setOpened] = useState<TransactionListEntry>();
  /** The closed Account a row touches, whose history stays as it is. */
  const closedAccount = (entry: TransactionListEntry) =>
    closed.find(({ id }) =>
      entry.kind === "transfer"
        ? id === entry.fromAccountId || id === entry.toAccountId
        : id === entry.accountId,
    );
  const deleteRedeclared = (entry: TransactionListEntry) =>
    onDeleteRedeclaredBalance(
      entry.id,
      entry.kind === "adjustment" ? "Adjustment" : "Balance check",
    );

  function open(entry: TransactionListEntry) {
    if (entry.kind === "transfer" && !closedAccount(entry)) {
      setEditingTransfer(entry);
    } else {
      setOpened(entry);
    }
  }

  function actionsFor(entry: TransactionListEntry): MenuAction[] {
    if (entry.kind === "opening-balance" || closedAccount(entry)) return [];
    const onAction = () => {
      if (entry.kind === "transfer") onDeleteTransfer(entry.id);
      else if (entry.kind === "transaction") onDelete(entry.id);
      else deleteRedeclared(entry);
    };
    return [{ label: "Delete", onAction }];
  }

  const editingOnPhone =
    opened?.kind === "transaction" && !closedAccount(opened)
      ? opened
      : undefined;
  const readOnly = opened && !editingOnPhone ? opened : undefined;

  return {
    actionsFor,
    open,
    inPlace: (
      entry: TransactionListEntry,
      close: (returnFocus: boolean) => void,
    ) => (
      <InPlaceRow
        entry={entry}
        currency={currency}
        closedAccountName={closedAccount(entry)?.name}
        onEdit={onEdit}
        onDelete={onDelete}
        onEditTransfer={onEditTransfer}
        onDeleteTransfer={onDeleteTransfer}
        onDeleteRedeclared={deleteRedeclared}
        close={close}
      />
    ),
    sheets: (
      <>
        <TransferSheet
          title="Edit Transfer"
          isOpen={editingTransfer !== undefined}
          onClose={() => setEditingTransfer(undefined)}
          currency={currency}
          draft={editingTransfer ?? {}}
          editing={editingTransfer}
          onSubmit={(input) => {
            if (editingTransfer) onEditTransfer(editingTransfer.id, input);
          }}
          onDelete={() => {
            if (editingTransfer) onDeleteTransfer(editingTransfer.id);
          }}
        />
        {editingOnPhone && (
          <RecordTransactionSheet
            key={editingOnPhone.id}
            currency={currency}
            editing={editingOnPhone}
            onRecord={(input) => onEdit(editingOnPhone.id, input)}
            onDelete={() => onDelete(editingOnPhone.id)}
            onClose={() => setOpened(undefined)}
          />
        )}
        <EntrySheet
          entry={readOnly}
          closedAccountName={readOnly && closedAccount(readOnly)?.name}
          onClose={() => setOpened(undefined)}
          onDelete={deleteRedeclared}
        />
      </>
    ),
  };
}
