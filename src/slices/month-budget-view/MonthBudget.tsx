import { useId, useState } from "react";
import type { Currency, Money } from "../../kernel/money";
import {
  type Month,
  monthName,
  nextMonth,
  previousMonth,
} from "../../kernel/month";
import { Sheet } from "../../ui/Sheet";
import type { CategoryGroup } from "../categories";
import { AssignPanel } from "./AssignPanel";
import { CategoryLists, CategoryTables } from "./CategoryRows";
import { CategorySheet, type SheetSteps } from "./CategorySheet";
import styles from "./MonthBudget.module.css";
import { type MoveInput, MoveMoneyForm } from "./MoveMoneyForm";
import { ReadyToAssign, SpentThisMonthCard } from "./Summary";
import { useAssignedColumn } from "./use-assigned-column";
import { useWide } from "./use-wide";
import { useVisibleCategoryGroups } from "./visible-categories";

export type AssignInput = { categoryId: string; month: Month; amount: Money };
export type MoveMoneyInput = MoveInput & { month: Month };

/**
 * The Budget screen, for reading a Month: the Month selector, Ready to Assign,
 * Spent this Month, then each Category Group with something to show. Wide
 * screens pin the summary in a column beside a table. The app shell decides
 * where the Month is kept and what assigning does; an error it throws is shown
 * on the screen. There is no stepping back past `firstMonth`.
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
  const monthId = useId();
  const groups = useVisibleCategoryGroups().filter(
    ({ categories }) => categories.length > 0,
  );
  const wide = useWide();
  const [error, setError] = useState<string>();
  const [steps, setSteps] = useState<SheetSteps>();
  const ids = groups.flatMap(({ categories }) =>
    categories.map(({ id }) => id),
  );
  const column = useAssignedColumn({
    ids,
    month,
    currency,
    onAssign: (categoryId, amount) =>
      attempt(() => onAssign({ categoryId, month, amount })),
    onError: setError,
  });

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

  const rows = {
    groups,
    month,
    currency,
    onOpenCategory: (categoryId: string) =>
      setSteps({ title: "Categories", ids, start: ids.indexOf(categoryId) }),
    onAssignGroup: ({ name, categories }: CategoryGroup) =>
      setSteps({
        title: `Assign ${name}`,
        ids: categories.map(({ id }) => id),
        start: 0,
      }),
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>Budget</h1>
        <nav className={styles.monthSelector} aria-label="Months">
          <button
            type="button"
            className={styles.monthStep}
            aria-label="Previous Month"
            disabled={month <= firstMonth}
            onClick={() => onMonthChange(previousMonth(month))}
          >
            ‹
          </button>
          <h2 id={monthId} className={styles.monthName}>
            {monthName(month)}
          </h2>
          <button
            type="button"
            className={styles.monthStep}
            aria-label="Next Month"
            onClick={() => onMonthChange(nextMonth(month))}
          >
            ›
          </button>
        </nav>
        {month > firstMonth && (
          <button
            type="button"
            className={styles.headerAction}
            onClick={() => attempt(() => onCopyLastMonth(month))}
          >
            Copy last Month
          </button>
        )}
        {wide && (
          <Sheet
            title="Move money"
            trigger="Move money"
            triggerClassName={styles.headerAction}
          >
            {(close) => (
              <MoveMoneyForm
                month={month}
                currency={currency}
                onMove={(input) => onMoveMoney({ ...input, month })}
                onAssign={(categoryId, amount) =>
                  onAssign({ categoryId, month, amount })
                }
                onDone={close}
              />
            )}
          </Sheet>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      <section className={styles.columns} aria-labelledby={monthId}>
        <div className={styles.summary}>
          <ReadyToAssign />
          {wide && (
            <AssignPanel column={column} month={month} currency={currency} />
          )}
          <SpentThisMonthCard month={month} />
        </div>
        <div className={styles.groups}>
          {wide ? (
            <CategoryTables {...rows} column={column} />
          ) : (
            <CategoryLists {...rows} />
          )}
        </div>
      </section>
      {steps && (
        <CategorySheet
          // A new Month, say from the browser's Back, starts it afresh.
          key={month}
          steps={steps}
          month={month}
          currency={currency}
          wide={wide}
          onClose={() => setSteps(undefined)}
          onAssign={(categoryId, amount) =>
            onAssign({ categoryId, month, amount })
          }
          onMove={(fromCategoryId, toCategoryId, amount) =>
            onMoveMoney({ fromCategoryId, toCategoryId, amount, month })
          }
        />
      )}
    </div>
  );
}
