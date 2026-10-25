import { type FormEvent, type ReactNode, useId, useState } from "react";
import { type Currency, type Money, parseMoney } from "../../kernel/money";
import type { Account } from "./queries";

/** Asks for an open Account's real balance, as the bank shows it. */
export function RedeclareBalanceForm({
  accounts,
  currency,
  onRedeclare,
}: {
  accounts: Account[];
  currency: Currency;
  onRedeclare: (accountId: string, balance: Money) => void;
}) {
  const [balance, setBalance] = useState("");
  return (
    <AccountForm
      heading="Re-declare a balance"
      submitLabel="Re-declare Balance"
      accounts={accounts}
      onSubmit={(accountId) => {
        const amount = parseMoney(balance, currency);
        if (!amount)
          throw new Error(`"${balance}" isn't an amount in ${currency}`);
        onRedeclare(accountId, amount);
        setBalance("");
      }}
    >
      <label>
        Balance ({currency}){" "}
        <input
          required
          inputMode="decimal"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
        />
      </label>
    </AccountForm>
  );
}

/** Asks for an Account's new name. */
export function RenameAccountForm({
  accounts,
  onRename,
}: {
  accounts: Account[];
  onRename: (accountId: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <AccountForm
      heading="Rename an Account"
      submitLabel="Rename Account"
      accounts={accounts}
      onSubmit={(accountId) => {
        onRename(accountId, name);
        setName("");
      }}
    >
      <label>
        New name{" "}
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
    </AccountForm>
  );
}

/** A form about one chosen Account. An error `onSubmit` throws is shown on it. */
function AccountForm({
  heading,
  submitLabel,
  accounts,
  onSubmit,
  children,
}: {
  heading: string;
  submitLabel: string;
  accounts: Account[];
  onSubmit: (accountId: string) => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const accountId =
    accounts.find(({ id }) => id === selectedId)?.id ?? accounts.at(0)?.id;
  if (!accountId) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!accountId) return;
    try {
      onSubmit(accountId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setError(undefined);
  }

  return (
    <form aria-labelledby={headingId} onSubmit={submit}>
      <h3 id={headingId}>{heading}</h3>
      <label>
        Account{" "}
        <select
          value={accountId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {accounts.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>{" "}
      {children} <button type="submit">{submitLabel}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
