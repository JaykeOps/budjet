import { type FormEvent, useId, useState } from "react";
import {
  type Currency,
  type Money,
  money,
  parseMoney,
} from "../../kernel/money";
import { OpenableSheet } from "../../ui/Sheet";
import styles from "./Accounts.module.css";
import { KIND_LABELS } from "./account-lines";
import type { AccountKind } from "./records";

export type OpenAccountInput = {
  name: string;
  kind: AccountKind;
  openingBalance: Money;
};

const KINDS = Object.keys(KIND_LABELS) as AccountKind[];

/**
 * Asks for an Account's name, kind and what it holds today, where blank is
 * $0.00. The app shell decides what opening it does; an error it throws is
 * shown on the form.
 */
export function OpenAccountForm({
  label,
  currency,
  onOpen,
}: {
  label: string;
  currency: Currency;
  onOpen: (input: OpenAccountInput) => void;
}) {
  const kindGroup = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [holds, setHolds] = useState("");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const openingBalance = holds.trim()
      ? parseMoney(holds, currency)
      : money(0, currency);
    if (!openingBalance) {
      setError(`"${holds}" isn't an amount in ${currency}`);
      return;
    }
    try {
      onOpen({ name, kind, openingBalance });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <form aria-label={label} className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        Name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <fieldset className={styles.kinds}>
        <legend>Kind</legend>
        {KINDS.map((option) => (
          <label key={option} className={styles.kind}>
            <input
              type="radio"
              name={kindGroup}
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            {KIND_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <label className={styles.field}>
        What it holds today
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={holds}
          onChange={(event) => setHolds(event.target.value)}
        />
      </label>
      <p className={styles.note}>
        This is its Opening Balance. It goes to Ready to Assign, for you to give
        every dollar a job.
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className={styles.wide}>
        Add Account
      </button>
    </form>
  );
}

/** Add Account, wherever it was asked for. */
export function AddAccountSheet({
  isOpen,
  onClose,
  currency,
  onOpen,
}: {
  isOpen: boolean;
  onClose: () => void;
  currency: Currency;
  onOpen: (input: OpenAccountInput) => void;
}) {
  return (
    <OpenableSheet title="Add Account" isOpen={isOpen} onClose={onClose}>
      {() => (
        <OpenAccountForm
          label="Add Account"
          currency={currency}
          onOpen={onOpen}
        />
      )}
    </OpenableSheet>
  );
}
