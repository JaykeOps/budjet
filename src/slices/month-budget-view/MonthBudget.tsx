import { type FormEvent, useId, useState } from "react";
import {
  type Currency,
  formatMoney,
  type Money,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import {
  type Month,
  monthName,
  nextMonth,
  previousMonth,
} from "../../kernel/month";
import { useAssignment } from "../assignments";
import { useAvailable, useReadyToAssign, useSpending } from "../budget-totals";
import { type Category, useCategoryGroups } from "../categories";

export type AssignInput = { categoryId: string; month: Month; amount: Money };

/**
 * The Month screen: controls to step between Months, Ready to Assign, then
 * every Category under its Category Group with its Assignment, spending and
 * Available for the Month. The app shell decides where the Month is kept and
 * what assigning does; an error it throws is shown on the screen. There is no
 * stepping back past `firstMonth`.
 */
export function MonthBudget({
  month,
  firstMonth,
  currency,
  onMonthChange,
  onAssign,
}: {
  month: Month;
  firstMonth: Month;
  currency: Currency;
  onMonthChange: (month: Month) => void;
  onAssign: (input: AssignInput) => void;
}) {
  const headingId = useId();
  const groups = useCategoryGroups();
  const [error, setError] = useState<string>();

  function assign(input: AssignInput) {
    try {
      onAssign(input);
      setError(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{monthName(month)}</h2>
      <nav aria-label="Months">
        <button
          type="button"
          disabled={month <= firstMonth}
          onClick={() => onMonthChange(previousMonth(month))}
        >
          Previous Month
        </button>{" "}
        <button type="button" onClick={() => onMonthChange(nextMonth(month))}>
          Next Month
        </button>
      </nav>
      <ReadyToAssign />
      {error && <p role="alert">{error}</p>}
      <table aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Assigned</th>
            <th scope="col">Spent</th>
            <th scope="col">Available</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.id}>
            <tr>
              <th scope="rowgroup" colSpan={4}>
                {group.name}
              </th>
            </tr>
            {group.categories.map((category) => (
              <CategoryRow
                // A new Month starts every row afresh, dropping unsaved drafts.
                key={`${month}/${category.id}`}
                category={category}
                month={month}
                currency={currency}
                onAssign={(amount) =>
                  assign({ categoryId: category.id, month, amount })
                }
                onError={setError}
              />
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}

/** Ready to Assign, as a red warning when more is assigned than there is. */
function ReadyToAssign() {
  const labelId = useId();
  const amount = useReadyToAssign();
  if (!amount) return null;
  const overassigned = amount.minorUnits < 0;

  return (
    <p
      role="status"
      aria-labelledby={labelId}
      className={
        overassigned ? "ready-to-assign overassigned" : "ready-to-assign"
      }
    >
      <span id={labelId}>Ready to Assign</span>{" "}
      <strong style={overassigned ? { color: "#b22222" } : undefined}>
        {formatMoney(amount)}
      </strong>
      {overassigned && " You have assigned more money than you have."}
    </p>
  );
}

/**
 * A Category with its spending and Available, and its Assignment, set by
 * typing an amount and pressing Enter or leaving the field.
 */
function CategoryRow({
  category,
  month,
  currency,
  onAssign,
  onError,
}: {
  category: Category;
  month: Month;
  currency: Currency;
  onAssign: (amount: Money) => void;
  onError: (message: string | undefined) => void;
}) {
  const assigned = useAssignment(category.id, month) ?? money(0, currency);
  const spent = useSpending(category.id, month) ?? money(0, currency);
  const available = useAvailable(category.id, month) ?? money(0, currency);
  const [draft, setDraft] = useState<string>();

  function save() {
    if (draft === undefined) return;
    const amount = parseMoney(draft, currency);
    if (!amount) {
      onError(`"${draft}" isn't an amount in ${currency}`);
      return;
    }
    setDraft(undefined);
    onError(undefined);
    if (amount.minorUnits !== assigned.minorUnits) onAssign(amount);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save();
  }

  return (
    <tr>
      <th scope="row">{category.name}</th>
      <td>
        <form onSubmit={submit}>
          <input
            aria-label={`Assignment for ${category.name}`}
            inputMode="decimal"
            value={draft ?? typedMoney(assigned)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
          />
        </form>
      </td>
      <td>{formatMoney(spent)}</td>
      <td>{formatMoney(available)}</td>
    </tr>
  );
}
