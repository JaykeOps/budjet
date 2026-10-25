import { type FormEvent, useId, useState } from "react";
import {
  type Currency,
  formatMoney,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { type Account, useAccounts } from "../accounts";
import type { TransferInput } from "./commands";
import { transfers as allTransfers, type Transfer } from "./queries";

/**
 * Every Transfer, newest first, a form to make another, and a way to edit or
 * delete each. The app shell decides what making, editing and deleting do; an
 * error it throws is shown where it happened.
 */
export function TransfersScreen({
  currency,
  onMake,
  onEdit,
  onDelete,
}: {
  currency: Currency;
  onMake: (input: TransferInput) => void;
  onEdit: (id: string, input: TransferInput) => void;
  onDelete: (id: string) => void;
}) {
  const headingId = useId();
  const all = useAccounts();
  const open = all.filter(({ closed }) => !closed);
  const names = new Map(all.map(({ id, name }) => [id, name]));
  const transfers = useChangeLogQuery(allTransfers);
  const [editing, setEditing] = useState<Transfer>();
  const [error, setError] = useState<string>();

  if (open.length < 2) return null;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Transfers</h2>
      <TransferForm
        heading="Make a Transfer"
        submitLabel="Make Transfer"
        accounts={open}
        currency={currency}
        onSubmit={onMake}
      />
      {editing && (
        <TransferForm
          key={editing.id}
          heading="Edit Transfer"
          submitLabel="Save Transfer"
          accounts={open}
          currency={currency}
          initial={editing}
          onSubmit={(input) => {
            onEdit(editing.id, input);
            setEditing(undefined);
          }}
          onCancel={() => setEditing(undefined)}
        />
      )}
      <table aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Memo</th>
            <th scope="col">Amount</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((transfer) => (
            <tr key={transfer.id}>
              <td>{transfer.date}</td>
              <td>{names.get(transfer.fromAccountId)}</td>
              <td>{names.get(transfer.toAccountId)}</td>
              <td>{transfer.memo}</td>
              <td>{formatMoney(transfer.amount)}</td>
              <td>
                <button type="button" onClick={() => setEditing(transfer)}>
                  Edit
                </button>{" "}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      onDelete(transfer.id);
                      setError(undefined);
                    } catch (failure) {
                      setError(
                        failure instanceof Error
                          ? failure.message
                          : String(failure),
                      );
                    }
                    if (editing?.id === transfer.id) setEditing(undefined);
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function TransferForm({
  heading,
  submitLabel,
  accounts,
  currency,
  initial,
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  accounts: Account[];
  currency: Currency;
  initial?: Transfer;
  onSubmit: (input: TransferInput) => void;
  onCancel?: () => void;
}) {
  const headingId = useId();
  const [fromAccountId, setFromAccountId] = useState(
    initial?.fromAccountId ?? accounts[0].id,
  );
  const [toAccountId, setToAccountId] = useState(
    initial?.toAccountId ?? accounts[1].id,
  );
  const [date, setDate] = useState(initial?.date ?? today);
  const [amount, setAmount] = useState(
    initial ? typedMoney(initial.amount) : "",
  );
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const typed = parseMoney(amount, currency);
    if (!typed) {
      setError(`"${amount}" isn't an amount in ${currency}`);
      return;
    }
    try {
      onSubmit({ fromAccountId, toAccountId, date, amount: typed, memo });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setError(undefined);
    setAmount("");
    setMemo("");
  }

  const accountOptions = accounts.map(({ id, name }) => (
    <option key={id} value={id}>
      {name}
    </option>
  ));

  return (
    <form aria-labelledby={headingId} onSubmit={submit}>
      <h3 id={headingId}>{heading}</h3>
      <label>
        From{" "}
        <select
          value={fromAccountId}
          onChange={(event) => setFromAccountId(event.target.value)}
        >
          {accountOptions}
        </select>
      </label>{" "}
      <label>
        To{" "}
        <select
          value={toAccountId}
          onChange={(event) => setToAccountId(event.target.value)}
        >
          {accountOptions}
        </select>
      </label>{" "}
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
        Amount ({currency}){" "}
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>{" "}
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

/** This device's local date, "YYYY-MM-DD". */
function today(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
