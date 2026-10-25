import { type FormEvent, useId, useState } from "react";
import { type Currency, type Money, parseMoney } from "../../kernel/money";
import { useCategoryGroups } from "../categories";

export type MoveInput = {
  fromCategoryId: string;
  toCategoryId: string;
  amount: Money;
};

/**
 * Moves an amount from one Category's Assignment to another's. `onMove`
 * returns false when the move was refused; the form then keeps what was typed.
 */
export function MoveMoneyForm({
  currency,
  onMove,
  onError,
}: {
  currency: Currency;
  onMove: (input: MoveInput) => boolean;
  onError: (message: string | undefined) => void;
}) {
  const headingId = useId();
  const groups = useCategoryGroups();
  const firstCategoryId = groups.flatMap((group) => group.categories)[0]?.id;
  const [from, setFrom] = useState<string>();
  const [to, setTo] = useState<string>();
  const [amount, setAmount] = useState("");
  const fromCategoryId = from ?? firstCategoryId ?? "";
  const toCategoryId = to ?? firstCategoryId ?? "";

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMoney(amount, currency);
    if (!parsed) {
      onError(`"${amount}" isn't an amount in ${currency}`);
      return;
    }
    if (onMove({ fromCategoryId, toCategoryId, amount: parsed })) {
      setAmount("");
    }
  }

  const options = groups.map((group) => (
    <optgroup key={group.id} label={group.name}>
      {group.categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </optgroup>
  ));

  return (
    <form aria-labelledby={headingId} onSubmit={submit}>
      <h3 id={headingId}>Move money</h3>
      <label>
        From{" "}
        <select
          value={fromCategoryId}
          onChange={(event) => setFrom(event.target.value)}
        >
          {options}
        </select>
      </label>{" "}
      <label>
        To{" "}
        <select
          value={toCategoryId}
          onChange={(event) => setTo(event.target.value)}
        >
          {options}
        </select>
      </label>{" "}
      <label>
        Amount{" "}
        <input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>{" "}
      <button type="submit">Move</button>
    </form>
  );
}
