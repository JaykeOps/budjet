import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  type Currency,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import type { MenuAction } from "../../ui/Menu";
import { type Account, useAccounts } from "../accounts";
import { type CategoryGroup, useCategoryGroups } from "../categories";
import type { TransactionInput } from "./commands";
import { History } from "./History";
import styles from "./History.module.css";
import { usePayees, useStatements } from "./hooks";
import type { Transaction, TransactionListEntry } from "./queries";
import { type Showing, ShowingPicker } from "./ShowingPicker";

/**
 * History as Month Statements, of every Account or the one the app shell says
 * it is showing, with a form to record a Transaction, a way to edit or delete
 * each one, and to delete an Adjustment or Balance check, unless its Account is
 * closed. The app shell keeps what's showing and decides what recording,
 * editing and deleting do; an error it throws is shown on the form.
 */
export function TransactionsScreen({
  currency,
  showing,
  onShow,
  onRecord,
  onEdit,
  onDelete,
  onDeleteRedeclaredBalance,
}: {
  currency: Currency;
  showing: Showing;
  onShow: (showing: Showing) => void;
  onRecord: (input: TransactionInput) => void;
  onEdit: (id: string, input: TransactionInput) => void;
  onDelete: (id: string) => void;
  onDeleteRedeclaredBalance: (recordId: string) => void;
}) {
  const headingId = useId();
  const accounts = useAccounts();
  const openAccounts = accounts.filter(({ closed }) => !closed);
  const closedIds = new Set(
    accounts.filter(({ closed }) => closed).map(({ id }) => id),
  );
  const [editing, setEditing] = useState<Transaction>();
  const account = accounts.find(({ id }) => id === showing.accountId);
  const all = useStatements(account?.id);
  const statements = showing.month
    ? all.filter(({ month }) => month === showing.month)
    : all;

  function actionsFor(entry: TransactionListEntry): MenuAction[] {
    if (
      entry.kind === "transfer" ||
      entry.kind === "opening-balance" ||
      closedIds.has(entry.accountId)
    ) {
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

  const recordInto = account ?? openAccounts.at(0);
  return (
    <section aria-labelledby={headingId}>
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
      ) : editing ? (
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
      ) : (
        recordInto && (
          <TransactionForm
            key={recordInto.id}
            heading="Record a Transaction"
            submitLabel="Record Transaction"
            defaultAccountId={recordInto.id}
            accounts={openAccounts}
            currency={currency}
            onSubmit={onRecord}
          />
        )
      )}
      <ShowingPicker
        showing={{ accountId: account?.id, month: showing.month }}
        onShow={(to) => {
          setEditing(undefined);
          onShow(to);
        }}
      />
      {statements.length === 0 ? (
        <p>Nothing here. Try another Month.</p>
      ) : (
        <History
          label={`History of ${account?.name ?? "All Accounts"}`}
          statements={statements}
          accountId={account?.id}
          askedMonth={showing.month}
          actionsFor={actionsFor}
        />
      )}
    </section>
  );
}

type Direction = "out" | "in";

/**
 * Records a new Transaction, or edits one when given its `initial` values.
 * After recording, the form clears for the next one.
 */
function TransactionForm({
  heading,
  submitLabel,
  defaultAccountId,
  accounts,
  currency,
  initial,
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  defaultAccountId: string;
  /** The Accounts to choose from. Without them it stays in `defaultAccountId`. */
  accounts?: Account[];
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
  const [accountId, setAccountId] = useState(defaultAccountId);
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
        accountId,
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
      {accounts && (
        <>
          <label>
            Account{" "}
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>{" "}
        </>
      )}
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

/** This device's local date, "YYYY-MM-DD". */
function today(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
