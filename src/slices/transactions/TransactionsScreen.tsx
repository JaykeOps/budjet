import { type FormEvent, useId, useState } from "react";
import {
  type Currency,
  formatMoney,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import { type Account, useAccounts } from "../accounts";
import { type CategoryGroup, useCategoryGroups } from "../categories";
import type { TransactionInput } from "./commands";
import { useAccountTransactionList, usePayees } from "./hooks";
import type { Transaction } from "./queries";

/**
 * An Account's Transactions, newest first, with a form to record another in
 * it and a way to edit or delete each one. The app shell decides what
 * recording, editing and deleting do; an error it throws is shown on the form.
 */
export function TransactionsScreen({
  currency,
  onRecord,
  onEdit,
  onDelete,
}: {
  currency: Currency;
  onRecord: (input: TransactionInput) => void;
  onEdit: (id: string, input: TransactionInput) => void;
  onDelete: (id: string) => void;
}) {
  const headingId = useId();
  const accounts = useAccounts().filter(({ closed }) => !closed);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<Transaction>();
  const account =
    accounts.find(({ id }) => id === selectedId) ?? accounts.at(0);
  if (!account) return null;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Transactions</h2>
      <label>
        Account{" "}
        <select
          value={account.id}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setEditing(undefined);
          }}
        >
          {accounts.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {editing ? (
        <TransactionForm
          key={editing.id}
          heading="Edit Transaction"
          submitLabel="Save Transaction"
          accountId={editing.accountId}
          currency={currency}
          initial={editing}
          onSubmit={(input) => {
            onEdit(editing.id, input);
            setEditing(undefined);
          }}
          onCancel={() => setEditing(undefined)}
        />
      ) : (
        <TransactionForm
          key={account.id}
          heading="Record a Transaction"
          submitLabel="Record Transaction"
          accountId={account.id}
          currency={currency}
          onSubmit={onRecord}
        />
      )}
      <TransactionList
        account={account}
        onEdit={setEditing}
        onDelete={(id) => {
          if (editing?.id === id) setEditing(undefined);
          onDelete(id);
        }}
      />
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
  accountId,
  currency,
  initial,
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  accountId: string;
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
    <form aria-labelledby={headingId} onSubmit={submit}>
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

/** Every row is this tall, so the list knows which rows are in view without measuring them. */
const ROW_HEIGHT = 40;
/** How tall the list may grow before it scrolls. */
const VIEW_HEIGHT = 480;
/** Rows rendered beyond each edge of the view, so fast scrolling shows no gaps. */
const OVERSCAN = 10;

/**
 * An Account's Transactions and Transfers with virtual scrolling: only the
 * rows in view (and a few either side) are rendered, so years of history
 * scroll smoothly. Transfer rows are 40px like the rest; they are edited on
 * the Transfers screen.
 */
function TransactionList({
  account,
  onEdit,
  onDelete,
}: {
  account: Account;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const headingId = useId();
  const entries = useAccountTransactionList(account.id);
  const accountNames = new Map(useAccounts().map(({ id, name }) => [id, name]));
  const groups = useCategoryGroups();
  const [scrollTop, setScrollTop] = useState(0);
  const categoryNames = new Map(
    groups.flatMap(({ categories }) =>
      categories.map(({ id, name }) => [id, name]),
    ),
  );
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    entries.length,
    Math.ceil((scrollTop + VIEW_HEIGHT) / ROW_HEIGHT) + OVERSCAN,
  );
  const cell = { height: ROW_HEIGHT, padding: "0 0.5em" } as const;

  return (
    <>
      <h3 id={headingId}>Transactions in {account.name}</h3>
      <div
        style={{ maxHeight: VIEW_HEIGHT, overflowY: "auto" }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <table
          aria-labelledby={headingId}
          aria-rowcount={entries.length + 1}
          style={{ borderCollapse: "collapse", whiteSpace: "nowrap" }}
        >
          <thead style={{ position: "sticky", top: 0, background: "Canvas" }}>
            <tr aria-rowindex={1}>
              <th scope="col">Date</th>
              <th scope="col">Payee</th>
              <th scope="col">Category</th>
              <th scope="col">Memo</th>
              <th scope="col">Amount</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {first > 0 && (
              <tr aria-hidden style={{ height: first * ROW_HEIGHT }} />
            )}
            {entries.slice(first, last).map((entry, index) =>
              entry.kind === "transfer" ? (
                <tr key={entry.id} aria-rowindex={first + index + 2}>
                  <td style={cell}>{entry.date}</td>
                  <td style={cell}>
                    {entry.amount.minorUnits < 0
                      ? "Transfer to "
                      : "Transfer from "}
                    {accountNames.get(entry.otherAccountId)}
                  </td>
                  <td style={cell} />
                  <td style={cell}>{entry.memo}</td>
                  <td style={cell}>{formatMoney(entry.amount)}</td>
                  <td style={cell} />
                </tr>
              ) : (
                <tr key={entry.id} aria-rowindex={first + index + 2}>
                  <td style={cell}>{entry.date}</td>
                  <td style={cell}>{entry.payee}</td>
                  <td style={cell}>
                    {entry.categoryId
                      ? categoryNames.get(entry.categoryId)
                      : "Ready to Assign"}
                  </td>
                  <td style={cell}>{entry.memo}</td>
                  <td style={cell}>{formatMoney(entry.amount)}</td>
                  <td style={cell}>
                    <button
                      type="button"
                      onClick={() => {
                        const { kind: _, ...transaction } = entry;
                        onEdit(transaction);
                      }}
                    >
                      Edit
                    </button>{" "}
                    <button type="button" onClick={() => onDelete(entry.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ),
            )}
            {last < entries.length && (
              <tr
                aria-hidden
                style={{ height: (entries.length - last) * ROW_HEIGHT }}
              />
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** This device's local date, "YYYY-MM-DD". */
function today(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
