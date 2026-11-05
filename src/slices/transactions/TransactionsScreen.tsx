import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type Currency,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import type { MenuAction } from "../../ui/Menu";
import { type Account, useAccounts } from "../accounts";
import { type CategoryGroup, useCategoryGroups } from "../categories";
import { type TransferInput, TransferSheet } from "../transfers";
import type { TransactionInput } from "./commands";
import { History } from "./History";
import styles from "./History.module.css";
import { usePayees, useStatements } from "./hooks";
import type {
  Transaction,
  TransactionListEntry,
  TransferEntry,
} from "./queries";
import { today } from "./record-flow";
import { type Showing, ShowingPicker } from "./ShowingPicker";

/** What the app shell does with the rows of a history. */
type HistoryActions = {
  currency: Currency;
  onEdit: (id: string, input: TransactionInput) => void;
  onDelete: (id: string) => void;
  onDeleteRedeclaredBalance: (recordId: string) => void;
  onEditTransfer: (id: string, input: TransferInput) => void;
  onDeleteTransfer: (id: string) => void;
};

/**
 * History as Month Statements, of every Account or the one the app shell says
 * it is showing, with a way to change each row, unless a closed Account is
 * involved. The app shell keeps what's showing, gives the row that records, and
 * decides what editing and deleting do; an error it throws is shown on the form.
 */
export function TransactionsScreen({
  showing,
  onShow,
  recordRow,
  ...actions
}: HistoryActions & {
  showing: Showing;
  onShow: (showing: Showing) => void;
  /** The row that records on desktop, if it's open. */
  recordRow: ReactNode;
}) {
  const headingId = useId();
  const accounts = useAccounts();
  const account = accounts.find(({ id }) => id === showing.accountId);
  const all = useStatements(account?.id);
  const statements = showing.month
    ? all.filter(({ month }) => month === showing.month)
    : all;
  const rows = useRowChanges(actions);

  return (
    <section aria-labelledby={headingId} className={styles.screen}>
      <h2 id={headingId}>
        {account ? (
          account.name
        ) : (
          <>
            <span className={styles.onlyOnPhone}>Activity</span>
            <span className={styles.notOnPhone}>All Accounts</span>
          </>
        )}
      </h2>
      {account?.closed ? (
        <p>
          Closed. Its history stays here, and it takes no new Transactions or
          Transfers.
        </p>
      ) : (
        rows.editing
      )}
      <ShowingPicker
        showing={{ accountId: account?.id, month: showing.month }}
        onShow={(to) => {
          rows.stopEditing();
          onShow(to);
        }}
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
        />
      )}
      {rows.transferSheet}
    </section>
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
      {rows.editing}
      <History
        label={`History of ${account.name}`}
        statements={statements}
        accountId={account.id}
        actionsFor={rows.actionsFor}
      />
      {rows.transferSheet}
    </>
  );
}

/** Each history row's More menu, and the form or sheet it leads to. */
function useRowChanges({
  currency,
  onEdit,
  onDelete,
  onDeleteRedeclaredBalance,
  onEditTransfer,
  onDeleteTransfer,
}: HistoryActions) {
  const closedIds = new Set(
    useAccounts()
      .filter(({ closed }) => closed)
      .map(({ id }) => id),
  );
  const [editing, setEditing] = useState<Transaction>();
  const [editingTransfer, setEditingTransfer] = useState<TransferEntry>();

  function actionsFor(entry: TransactionListEntry): MenuAction[] {
    if (entry.kind === "transfer") {
      if (
        closedIds.has(entry.fromAccountId) ||
        closedIds.has(entry.toAccountId)
      ) {
        return [];
      }
      return [
        { label: "Edit", onAction: () => setEditingTransfer(entry) },
        { label: "Delete", onAction: () => onDeleteTransfer(entry.id) },
      ];
    }
    if (entry.kind === "opening-balance" || closedIds.has(entry.accountId)) {
      return [];
    }
    if (entry.kind !== "transaction") {
      return [
        {
          label: "Delete",
          onAction: () => onDeleteRedeclaredBalance(entry.id),
        },
      ];
    }
    const { kind: _, ...transaction } = entry;
    return [
      { label: "Edit", onAction: () => setEditing(transaction) },
      {
        label: "Delete",
        onAction: () => {
          if (editing?.id === entry.id) setEditing(undefined);
          onDelete(entry.id);
        },
      },
    ];
  }

  return {
    actionsFor,
    stopEditing: () => setEditing(undefined),
    editing: editing && (
      <TransactionForm
        key={editing.id}
        heading="Edit Transaction"
        submitLabel="Save Transaction"
        defaultAccountId={editing.accountId}
        currency={currency}
        initial={editing}
        onSubmit={(input) => {
          onEdit(editing.id, input);
          setEditing(undefined);
        }}
        onCancel={() => setEditing(undefined)}
      />
    ),
    transferSheet: (
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
      />
    ),
  };
}

type Direction = "out" | "in";

/** Edits a Transaction, in the Account it's in. */
function TransactionForm({
  heading,
  submitLabel,
  defaultAccountId,
  currency,
  initial,
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  defaultAccountId: string;
  currency: Currency;
  initial?: Transaction;
  onSubmit: (input: TransactionInput) => void;
  onCancel?: () => void;
}) {
  const headingId = useId();
  const categoryFieldId = useId();
  const payeesId = useId();
  const groups = useCategoryGroups();
  const payees = usePayees();
  const form = useRef<HTMLFormElement>(null);
  const [date, setDate] = useState(initial?.date ?? today);
  const [direction, setDirection] = useState<Direction>(
    initial && initial.amount.minorUnits > 0 ? "in" : "out",
  );
  const [amount, setAmount] = useState(
    initial
      ? typedMoney(money(Math.abs(initial.amount.minorUnits), currency))
      : "",
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [payee, setPayee] = useState(initial?.payee ?? "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [error, setError] = useState<string>();

  // The row being edited can be far down the history, a long way below this form.
  const editing = initial !== undefined;
  useEffect(() => {
    if (editing) form.current?.scrollIntoView({ block: "nearest" });
  }, [editing]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const typed = parseMoney(amount, currency);
    if (!typed || typed.minorUnits < 0) {
      setError(`"${amount}" isn't an amount in ${currency}`);
      return;
    }
    const sign = direction === "out" ? -1 : 1;
    try {
      onSubmit({
        accountId: defaultAccountId,
        date,
        amount: money(sign * typed.minorUnits, currency),
        categoryId: categoryId || undefined,
        payee,
        memo,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setError(undefined);
    setDirection("out");
    setAmount("");
    setCategoryId("");
    setPayee("");
    setMemo("");
  }

  return (
    <form ref={form} aria-labelledby={headingId} onSubmit={submit}>
      <h3 id={headingId}>{heading}</h3>
      <label>
        Date{" "}
        <input
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>{" "}
      <label>
        Money{" "}
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value as Direction)}
        >
          <option value="out">Going out</option>
          <option value="in">Coming in</option>
        </select>
      </label>{" "}
      <label>
        Amount ({currency}){" "}
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>{" "}
      <label htmlFor={categoryFieldId}>Category</label>{" "}
      <CategoryPicker
        id={categoryFieldId}
        groups={groups}
        value={categoryId}
        onChange={setCategoryId}
      />{" "}
      <label>
        Payee{" "}
        <input
          list={payeesId}
          autoComplete="off"
          value={payee}
          onChange={(event) => setPayee(event.target.value)}
        />
      </label>
      <datalist id={payeesId}>
        {payees.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>{" "}
      <label>
        Memo{" "}
        <input value={memo} onChange={(event) => setMemo(event.target.value)} />
      </label>{" "}
      <button type="submit">{submitLabel}</button>
      {onCancel && (
        <>
          {" "}
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

/**
 * Every Category still in use, under its Category Group, plus the one already
 * chosen even if it has since been hidden. No Category means Ready to Assign.
 */
function CategoryPicker({
  id,
  groups,
  value,
  onChange,
}: {
  id: string;
  groups: CategoryGroup[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">None: Ready to Assign</option>
      {groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.categories
            .filter(({ id, hidden }) => !hidden || id === value)
            .map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
