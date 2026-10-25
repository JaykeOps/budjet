import { type FormEvent, useState } from "react";
import { type Currency, currencies } from "../../kernel/money";

const currencyNames = new Intl.DisplayNames(undefined, { type: "currency" });

/** Asks for the Budget's currency. The app shell decides what creating a Budget does. */
export function BudgetSetupForm({
  onCreate,
}: {
  onCreate: (input: { currency: Currency }) => void;
}) {
  const [currency, setCurrency] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({ currency });
  }

  return (
    <form onSubmit={submit}>
      <h2>Create your Budget</h2>
      <p>
        Choose the currency your Budget is kept in. You can't change it later.
      </p>
      <label>
        Currency{" "}
        <select
          required
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
        >
          <option value="" disabled>
            Choose a currency
          </option>
          {currencies().map((code) => (
            <option key={code} value={code}>
              {code} — {currencyNames.of(code)}
            </option>
          ))}
        </select>
      </label>{" "}
      <button type="submit">Create Budget</button>
    </form>
  );
}
