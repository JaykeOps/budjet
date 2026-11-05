import { type FormEvent, useId, useState } from "react";
import {
  type Currency,
  formatMoney,
  type Money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import type { Month } from "../../kernel/month";
import styles from "./CategorySheet.module.css";
import { groupsOf, useSheetBudget } from "./category-sheet";
import { moveChange, movePlan, moveStart, READY_TO_ASSIGN } from "./move-money";

export type MoveInput = {
  fromCategoryId: string;
  toCategoryId: string;
  amount: Money;
};

/**
 * From / To / Amount, between Categories or Ready to Assign. `onMove` and
 * `onAssign` may throw when refused; the form shows why and stays put.
 */
export function MoveMoneyForm({
  month,
  currency,
  onMove,
  onAssign,
  onDone,
}: {
  month: Month;
  currency: Currency;
  onMove: (input: MoveInput) => void;
  onAssign: (categoryId: string, amount: Money) => void;
  onDone: () => void;
}) {
  const fromId = useId();
  const toId = useId();
  const budget = useSheetBudget(month, currency);
  const [start] = useState(() => moveStart(budget));
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [typed, setTyped] = useState(
    start.amount ? typedMoney(start.amount) : "",
  );
  const [error, setError] = useState<string>();
  const amount = parseMoney(typed, currency) ?? undefined;
  const plan = movePlan(budget, from, to, amount, month);
  const unreadable =
    typed.trim() !== "" && !amount
      ? `"${typed}" isn't an amount in ${currency}`
      : undefined;
  const shown = error ?? plan.refusal ?? unreadable;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!amount || !plan.ready) return;
    try {
      const change = moveChange(budget, from, to, amount);
      if (change.kind === "assign") onAssign(change.categoryId, change.amount);
      else onMove(change);
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  const options = (
    <>
      <option value={READY_TO_ASSIGN}>
        Ready to Assign ({formatMoney(budget.readyToAssign)})
      </option>
      {groupsOf(budget.categories).map(([groupName, members]) => (
        <optgroup key={groupName} label={groupName}>
          {members.map(({ id, name, row }) => (
            <option key={id} value={id}>
              {name} ({formatMoney(row.available)})
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <form className={styles.moveForm} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor={fromId}>From</label>
        <select
          id={fromId}
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            setError(undefined);
          }}
        >
          {options}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={toId}>To</label>
        <select
          id={toId}
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            setError(undefined);
          }}
        >
          {options}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.field}>
          Amount
          <input
            className={styles.amount}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(undefined);
            }}
            onFocus={(event) => event.target.select()}
          />
        </label>
        {shown && <p role="alert">{shown}</p>}
      </div>
      {from !== to && (
        <div className={styles.after} aria-live="polite">
          {plan.ends.map(({ name, after }) => (
            <p key={name}>
              <span>{name} after</span>
              <strong>{formatMoney(after)}</strong>
            </p>
          ))}
          {plan.note && <p className={styles.note}>{plan.note}</p>}
        </div>
      )}
      <button type="submit" className={styles.main} disabled={!plan.ready}>
        {amount && amount.minorUnits > 0
          ? `Move ${formatMoney(amount)}`
          : "Move"}
      </button>
    </form>
  );
}
