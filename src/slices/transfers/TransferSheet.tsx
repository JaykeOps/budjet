import { type FormEvent, useState } from "react";
import {
  type Currency,
  formatMoney,
  type Money,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import { OpenableSheet } from "../../ui/Sheet";
import { type Account, useAccounts } from "../accounts";
import type { TransferInput } from "./commands";
import styles from "./Transfer.module.css";

/** What the sheet starts with. Anything left out it chooses itself. */
export type TransferDraft = Partial<
  Pick<TransferInput, "fromAccountId" | "toAccountId" | "date" | "amount">
>;

/**
 * Moves money between open Accounts: amount, From, To and date, then what both
 * balances become. The app shell decides what submitting does; an error it
 * throws is shown on the form. `editing` is the Transfer being changed, whose
 * own money is already in those balances.
 */
export function TransferSheet({
  title,
  isOpen,
  onClose,
  currency,
  draft,
  editing,
  onSubmit,
  onDelete,
}: {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  currency: Currency;
  draft: TransferDraft;
  editing?: TransferInput;
  onSubmit: (input: TransferInput) => void;
  onDelete?: () => void;
}) {
  return (
    <OpenableSheet title={title} isOpen={isOpen} onClose={onClose}>
      {(close) => (
        <TransferForm
          currency={currency}
          draft={editing ?? draft}
          editing={editing}
          onSubmit={(input) => {
            onSubmit(input);
            close();
          }}
          onDelete={
            onDelete &&
            (() => {
              onDelete();
              close();
            })
          }
        />
      )}
    </OpenableSheet>
  );
}

function TransferForm({
  currency,
  draft,
  editing,
  onSubmit,
  onDelete,
}: {
  currency: Currency;
  draft: TransferDraft;
  editing?: TransferInput;
  onSubmit: (input: TransferInput) => void;
  onDelete?: () => void;
}) {
  const open = useAccounts().filter(({ closed }) => !closed);
  const firstOther = (id?: string) =>
    open.find((account) => account.id !== id)?.id ?? "";
  const [fromAccountId, setFrom] = useState(
    draft.fromAccountId ?? firstOther(draft.toAccountId),
  );
  const [toAccountId, setTo] = useState(
    draft.toAccountId ?? firstOther(fromAccountId),
  );
  const [date, setDate] = useState(draft.date ?? today);
  const [typed, setTyped] = useState(
    draft.amount ? typedMoney(draft.amount) : "",
  );
  const [error, setError] = useState<string>();
  const parsed = parseMoney(typed, currency);
  const amount = parsed && parsed.minorUnits > 0 ? parsed : undefined;
  const from = open.find(({ id }) => id === fromAccountId);
  const to = open.find(({ id }) => id === toAccountId);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!amount || !to) return;
    try {
      onSubmit({ ...editing, fromAccountId, toAccountId, date, amount });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        Amount
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        From
        <select
          value={fromAccountId}
          onChange={(event) => {
            setFrom(event.target.value);
            if (event.target.value === toAccountId) {
              setTo(firstOther(event.target.value));
            }
          }}
        >
          {open.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        To
        <select
          value={toAccountId}
          onChange={(event) => setTo(event.target.value)}
        >
          {open
            .filter(({ id }) => id !== fromAccountId)
            .map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
      </label>
      <label className={styles.field}>
        Date
        <input
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <div className={styles.note} aria-live="polite">
        {!to && <p>There's no other Account to transfer to yet.</p>}
        {amount && from && to && (
          <p>
            {from.name} goes to{" "}
            {formatMoney(balanceAfter(from, -amount.minorUnits, editing))}.{" "}
            {to.name} goes to{" "}
            {formatMoney(balanceAfter(to, amount.minorUnits, editing))}.
          </p>
        )}
        <p>
          A Transfer moves money between your Accounts. Your Categories and
          Ready to Assign don't change.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className={styles.save}>
        {onDelete && (
          <button type="button" className={styles.delete} onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="submit" disabled={!amount || !to}>
          {editing
            ? "Save changes"
            : `Transfer${amount ? ` ${formatMoney(amount)}` : ""}`}
        </button>
      </div>
    </form>
  );
}

/** An Account's balance with this Transfer moving `minorUnits`, in place of what `editing` moved. */
function balanceAfter(
  { id, balance }: Account,
  minorUnits: number,
  editing?: TransferInput,
): Money {
  let before = balance.minorUnits;
  if (editing?.fromAccountId === id) before += editing.amount.minorUnits;
  if (editing?.toAccountId === id) before -= editing.amount.minorUnits;
  return money(before + minorUnits, balance.currency);
}

/** This device's local date, "YYYY-MM-DD". */
function today(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
