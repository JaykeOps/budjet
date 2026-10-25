import { type FormEvent, useId, useState } from "react";
import { type Currency, type Money, parseMoney } from "../../kernel/money";
import type { AccountKind } from "./records";

export type OpenAccountInput = {
  name: string;
  kind: AccountKind;
  openingBalance: Money;
};

const KINDS: readonly { kind: AccountKind; label: string }[] = [
  { kind: "checking", label: "Checking" },
  { kind: "savings", label: "Savings" },
  { kind: "cash", label: "Cash" },
];

/**
 * Asks for an Account's name, type and Opening Balance. The app shell decides
 * what opening it does; an error it throws is shown on the form.
 */
export function OpenAccountForm({
  heading,
  currency,
  onOpen,
}: {
  heading: string;
  currency: Currency;
  onOpen: (input: OpenAccountInput) => void;
}) {
  const headingId = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [openingBalance, setOpeningBalance] = useState("");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = parseMoney(openingBalance, currency);
    if (!amount) {
      setError(`"${openingBalance}" isn't an amount in ${currency}`);
      return;
    }
    try {
      onOpen({ name, kind, openingBalance: amount });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setError(undefined);
    setName("");
    setKind("checking");
    setOpeningBalance("");
  }

  return (
    <form aria-labelledby={headingId} onSubmit={submit}>
      <h3 id={headingId}>{heading}</h3>
      <label>
        Name{" "}
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>{" "}
      <label>
        Type{" "}
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as AccountKind)}
        >
          {KINDS.map(({ kind, label }) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </label>{" "}
      <label>
        Opening Balance ({currency}){" "}
        <input
          required
          inputMode="decimal"
          value={openingBalance}
          onChange={(event) => setOpeningBalance(event.target.value)}
        />
      </label>{" "}
      <button type="submit">Add Account</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
