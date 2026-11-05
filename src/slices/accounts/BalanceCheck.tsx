import { type FormEvent, useState } from "react";
import {
  formatMoney,
  type Money,
  parseMoney,
  subtractMoney,
  typedMoney,
} from "../../kernel/money";
import styles from "./Accounts.module.css";
import type { Account } from "./queries";

/** What the app shell does when the user answers "Does this match your bank?". */
export type BalanceCheckActions = {
  onMatches: (account: Account) => void;
  onUpdate: (account: Account, balance: Money) => void;
};

/**
 * Asks whether the balance matches the bank. Compact, on the Accounts tab, it
 * is two buttons; on an Account's page it asks in words.
 */
export function BalanceCheck({
  account,
  compact = false,
  onMatches,
  onUpdate,
}: BalanceCheckActions & { account: Account; compact?: boolean }) {
  const [updating, setUpdating] = useState(false);
  if (updating) {
    return (
      <UpdateBalanceForm
        account={account}
        onUpdate={(balance) => {
          onUpdate(account, balance);
          setUpdating(false);
        }}
        onCancel={() => setUpdating(false)}
      />
    );
  }
  return (
    <div className={styles.check}>
      {!compact && (
        <p className={styles.question}>
          Does {formatMoney(account.balance)} match what your bank says?
        </p>
      )}
      <div className={styles.buttons}>
        <button type="button" onClick={() => onMatches(account)}>
          {compact ? "Matches my bank" : "It matches"}
        </button>
        <button
          type="button"
          className={styles.quiet}
          onClick={() => setUpdating(true)}
        >
          {compact ? "Update" : "It's different"}
        </button>
      </div>
    </div>
  );
}

function UpdateBalanceForm({
  account,
  onUpdate,
  onCancel,
}: {
  account: Account;
  onUpdate: (balance: Money) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState(typedMoney(account.balance));
  const [error, setError] = useState<string>();
  const balance = parseMoney(typed, account.balance.currency);
  const difference = balance && subtractMoney(balance, account.balance);
  const changes = difference !== undefined && difference.minorUnits !== 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!balance) return;
    if (!changes) {
      onCancel();
      return;
    }
    try {
      onUpdate(balance);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        What your bank says {account.name} holds
        <input
          inputMode="decimal"
          value={typed}
          // biome-ignore lint/a11y/noAutofocus: the user just asked to type this, and "It's different" is gone.
          autoFocus
          onFocus={(event) => event.target.select()}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      <p className={styles.note} aria-live="polite">
        {difference && adjustmentLine(difference)}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.buttons}>
        <button type="submit" disabled={!balance}>
          {balance && !changes ? "Done" : "Update balance"}
        </button>
        <button type="button" className={styles.quiet} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function adjustmentLine(difference: Money): string {
  if (difference.minorUnits === 0) return "Nothing changes.";
  const cameIn = difference.minorUnits > 0;
  return `Crownkeep records an Adjustment of ${cameIn ? "+" : ""}${formatMoney(difference)}. It ${cameIn ? "goes into" : "comes out of"} Ready to Assign.`;
}
