import { type FormEvent, useId, useState } from "react";
import { type Month, monthName } from "../../kernel/month";
import { Sheet } from "../../ui/Sheet";
import { useAccounts } from "../accounts";
import styles from "./History.module.css";
import { useStatements } from "./hooks";

/** What Activity narrows to. With neither, everything. */
export type Showing = { accountId?: string; month?: Month };

/**
 * One button, saying what's showing, that opens a choice of Accounts, including
 * closed ones, and Months. Nothing changes until its button, which says how many
 * entries the choice will show.
 */
export function ShowingPicker({
  showing,
  onShow,
}: {
  showing: Showing;
  onShow: (showing: Showing) => void;
}) {
  const accounts = useAccounts();
  const accountName = accounts.find(({ id }) => id === showing.accountId)?.name;
  return (
    <Sheet
      title="Show"
      triggerClassName={styles.showing}
      trigger={
        <>
          <span className={styles.showingLabel}>Showing:</span>{" "}
          <span>
            {accountName ?? "All Accounts"},{" "}
            {showing.month ? monthName(showing.month) : "every Month"}
          </span>
        </>
      }
    >
      {(close) => (
        <Choices
          initial={showing}
          onShow={(chosen) => {
            onShow(chosen);
            close();
          }}
        />
      )}
    </Sheet>
  );
}

function Choices({
  initial,
  onShow,
}: {
  initial: Showing;
  onShow: (showing: Showing) => void;
}) {
  const accounts = useAccounts();
  const months = useStatements().map(({ month }) => month);
  const [chosen, setChosen] = useState(initial);
  const count = useStatements(chosen.accountId)
    .filter(({ month }) => !chosen.month || month === chosen.month)
    .reduce((total, { entries }) => total + entries.length, 0);

  function submit(event: FormEvent) {
    event.preventDefault();
    onShow(chosen);
  }

  return (
    <form className={styles.picker} aria-label="Show" onSubmit={submit}>
      <div className={styles.choices}>
        <ChoiceGroup
          legend="Account"
          value={chosen.accountId}
          options={[
            { value: undefined, label: "All Accounts" },
            ...accounts.map(({ id, name, closed }) => ({
              value: id,
              label: closed ? `${name} (closed)` : name,
            })),
          ]}
          onChange={(accountId) => setChosen({ ...chosen, accountId })}
        />
        <ChoiceGroup
          legend="Month"
          value={chosen.month}
          options={[
            { value: undefined, label: "Every Month" },
            ...months.map((month) => ({
              value: month,
              label: monthName(month),
            })),
          ]}
          onChange={(month) => setChosen({ ...chosen, month })}
        />
      </div>
      <button type="submit" className={styles.show}>
        Show {count} {count === 1 ? "entry" : "entries"}
      </button>
    </form>
  );
}

function ChoiceGroup<Value extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: Value | undefined;
  options: { value: Value | undefined; label: string }[];
  onChange: (value: Value | undefined) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.label} className={styles.choice}>
          <input
            type="radio"
            name={name}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
