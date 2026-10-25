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
import {
  useAvailable,
  useOverspent,
  useReadyToAssign,
  useSpending,
} from "../budget-totals";
import type { Category, CategoryGroup } from "../categories";
import { type GroupSubtotals, useGroupSubtotals } from "./group-subtotals";
import { type MoveInput, MoveMoneyForm } from "./MoveMoneyForm";
import { useVisibleCategoryGroups } from "./visible-categories";

/** The red that marks money problems: Overspent Categories and a negative Ready to Assign. */
const WARNING_RED = "#b22222";

export type AssignInput = { categoryId: string; month: Month; amount: Money };
export type MoveMoneyInput = MoveInput & { month: Month };

/**
 * The Month screen: controls to step between Months, Ready to Assign, then
 * the Month's Overspent Categories, then every Category under its Category
 * Group with its Assignment, spending and Available for the Month, and
 * shortcuts to copy last Month's Assignments and to move money. Each group
 * shows subtotals and can be collapsed. The app shell decides where the Month
 * is kept and what assigning does; an error it throws is shown on the screen.
 * There is no stepping back past `firstMonth`.
 */
export function MonthBudget({
  month,
  firstMonth,
  currency,
  onMonthChange,
  onAssign,
  onCopyLastMonth,
  onMoveMoney,
}: {
  month: Month;
  firstMonth: Month;
  currency: Currency;
  onMonthChange: (month: Month) => void;
  onAssign: (input: AssignInput) => void;
  onCopyLastMonth: (month: Month) => void;
  onMoveMoney: (input: MoveMoneyInput) => void;
}) {
  const headingId = useId();
  const groups = useVisibleCategoryGroups();
  const subtotals = useGroupSubtotals(month, currency);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string>();

  function toggle(groupId: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(groupId)) next.add(groupId);
      return next;
    });
  }

  /** Runs a change, showing the error if it is refused; true when it went through. */
  function attempt(action: () => void): boolean {
    try {
      action();
      setError(undefined);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
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
      <OverspentCategories month={month} groups={groups} />
      {month > firstMonth && (
        <button
          type="button"
          onClick={() => attempt(() => onCopyLastMonth(month))}
        >
          Copy last Month
        </button>
      )}
      <MoveMoneyForm
        currency={currency}
        onMove={(input) => attempt(() => onMoveMoney({ ...input, month }))}
        onError={setError}
      />
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
            <GroupRow
              group={group}
              subtotals={subtotals[group.id]}
              expanded={!collapsed.has(group.id)}
              onToggle={() => toggle(group.id)}
            />
            {!collapsed.has(group.id) &&
              group.categories.map((category) => (
                <CategoryRow
                  // A new Month starts every row afresh, dropping unsaved drafts.
                  key={`${month}/${category.id}`}
                  category={category}
                  month={month}
                  currency={currency}
                  onAssign={(amount) =>
                    attempt(() =>
                      onAssign({ categoryId: category.id, month, amount }),
                    )
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
      <strong style={overassigned ? { color: WARNING_RED } : undefined}>
        {formatMoney(amount)}
      </strong>
      {overassigned && " You have assigned more money than you have."}
    </p>
  );
}

/**
 * The Categories whose Available is below zero this Month, in budget order.
 * Shown only when there are any.
 */
function OverspentCategories({
  month,
  groups,
}: {
  month: Month;
  groups: CategoryGroup[];
}) {
  const headingId = useId();
  const overspent = useOverspent(month) ?? [];
  if (overspent.length === 0) return null;
  const availableById = new Map(
    overspent.map(({ categoryId, available }) => [categoryId, available]),
  );
  const categories = groups
    .flatMap((group) => group.categories)
    .filter((category) => availableById.has(category.id));

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>Overspent Categories</h3>
      <ul aria-labelledby={headingId}>
        {categories.map((category) => {
          const available = availableById.get(category.id);
          return (
            <li key={category.id}>
              {category.name}{" "}
              {available && <AvailableAmount amount={available} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A Category Group's name, which collapses and expands it, and its subtotals. */
function GroupRow({
  group,
  subtotals,
  expanded,
  onToggle,
}: {
  group: CategoryGroup;
  subtotals: GroupSubtotals | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <tr>
      <th scope="rowgroup">
        <button type="button" aria-expanded={expanded} onClick={onToggle}>
          {group.name}
        </button>
      </th>
      <td>{subtotals && formatMoney(subtotals.assigned)}</td>
      <td>{subtotals && formatMoney(subtotals.spent)}</td>
      <td>{subtotals && <AvailableAmount amount={subtotals.available} />}</td>
    </tr>
  );
}

/** Available, in red when it is below zero. */
function AvailableAmount({ amount }: { amount: Money }) {
  return (
    <span style={amount.minorUnits < 0 ? { color: WARNING_RED } : undefined}>
      {formatMoney(amount)}
    </span>
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
  const overspent = available.minorUnits < 0;
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
      <td
        className={overspent ? "available overspent" : "available"}
        style={overspent ? { color: WARNING_RED } : undefined}
      >
        {formatMoney(available)}
      </td>
    </tr>
  );
}
