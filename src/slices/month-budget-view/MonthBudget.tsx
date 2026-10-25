import { type FormEvent, useId, useState } from "react";
import {
  type Currency,
  formatMoney,
  type Money,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import { type Month, monthName } from "../../kernel/month";
import { useAssignment } from "../assignments";
import { useReadyToAssign } from "../budget-totals";
import { type Category, useCategoryGroups } from "../categories";

export type AssignInput = { categoryId: string; month: Month; amount: Money };

/**
 * The Month screen: Ready to Assign, then every Category under its Category
 * Group with its Assignment for the Month. The app shell decides what
 * assigning does; an error it throws is shown on the screen.
 */
export function MonthBudget({
  month,
  currency,
  onAssign,
}: {
  month: Month;
  currency: Currency;
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
      <ReadyToAssign />
      {error && <p role="alert">{error}</p>}
      <table aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Assigned</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.id}>
            <tr>
              <th scope="rowgroup" colSpan={2}>
                {group.name}
              </th>
            </tr>
            {group.categories.map((category) => (
              <CategoryRow
                key={category.id}
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

/** A Category and its Assignment, set by typing an amount and pressing Enter or leaving the field. */
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
    </tr>
  );
}
