import { useId, useState } from "react";
import type { Currency, Money } from "../../kernel/money";
import {
  type Month,
  monthName,
  nextMonth,
  previousMonth,
} from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import {
  type CategoryChanges,
  CategoryEditor,
  useCategoryGroups,
} from "../categories";
import { AssignWalk, CopyLastMonth } from "./AssignWalk";
import { CategoryLists, CategoryTables } from "./CategoryRows";
import { CategorySheet, type SheetSteps } from "./CategorySheet";
import styles from "./MonthBudget.module.css";
import { type MoveInput, MoveMoneyForm } from "./MoveMoneyForm";
import { type FirstCategoryChanges, NoCategories } from "./NoCategories";
import { anythingAssigned, ReadyToAssign, SpentThisMonthCard } from "./Summary";
import { useWide } from "./use-wide";
import { useVisibleCategoryGroups } from "./visible-categories";

export type AssignInput = { categoryId: string; month: Month; amount: Money };
export type MoveMoneyInput = MoveInput & { month: Month };

/**
 * The Budget screen, for reading a Month: the Month selector, Ready to Assign,
 * Spent this Month, then each Category Group with something to show. Wide
 * screens pin the summary in a column beside a table. The app shell decides
 * where the Month is kept and what assigning does; an error it throws is shown
 * on the screen. There is no stepping back past `firstMonth`. While `editing`,
 * the Category editor replaces the rows: only the list on a phone, and beside
 * Ready to Assign on desktop. With no Categories, an empty state replaces the
 * rows; until anything is assigned, a note says where to start.
 */
export function MonthBudget({
  month,
  firstMonth,
  currency,
  onMonthChange,
  onAssign,
  onCopyLastMonth,
  onMoveMoney,
  editing,
  onEditingChange,
  categoryChanges,
  firstCategoryChanges,
}: {
  month: Month;
  firstMonth: Month;
  currency: Currency;
  onMonthChange: (month: Month) => void;
  onAssign: (input: AssignInput) => void;
  /** Copies into `month`, except the Categories the user unticked. */
  onCopyLastMonth: (month: Month, unticked: ReadonlySet<string>) => void;
  onMoveMoney: (input: MoveMoneyInput) => void;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  categoryChanges: CategoryChanges;
  firstCategoryChanges: FirstCategoryChanges;
}) {
  const monthId = useId();
  const groups = useVisibleCategoryGroups().filter(
    ({ categories }) => categories.length > 0,
  );
  const everyGroup = useCategoryGroups();
  const assigned = useChangeLogQuery(anythingAssigned);
  const coached = assigned ? undefined : groups[0]?.categories[0];
  const wide = useWide();
  const [error, setError] = useState<string>();
  const [steps, setSteps] = useState<SheetSteps>();
  const [flow, setFlow] = useState<"walk" | "copy">();
  const Rows = wide ? CategoryTables : CategoryLists;

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
    <div className={styles.screen}>
      <header className={styles.header}>
        {editing ? (
          <>
            <h1 className={styles.title}>Edit Categories</h1>
            <div className={styles.headerActions}>
              <button
                type="button"
                data-primary
                className={styles.headerAction}
                onClick={() => onEditingChange(false)}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
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
            <div className={styles.headerActions}>
              {wide && month > firstMonth && (
                <button
                  type="button"
                  className={styles.headerAction}
                  onClick={() => setFlow("copy")}
                >
                  Copy last Month
                </button>
              )}
              <button
                type="button"
                className={styles.headerAction}
                onClick={() => onEditingChange(true)}
              >
                Edit
              </button>
            </div>
          </>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      {editing ? (
        <div className={styles.columns}>
          {wide && (
            <div className={styles.summary}>
              <ReadyToAssign onAssign={() => setFlow("walk")} />
            </div>
          )}
          <CategoryEditor month={month} changes={categoryChanges} />
        </div>
      ) : (
        <section className={styles.columns} aria-labelledby={monthId}>
          <div className={styles.summary}>
            <ReadyToAssign onAssign={() => setFlow("walk")} />
            <SpentThisMonthCard month={month} />
          </div>
          <div className={styles.groups}>
            {everyGroup.every(({ categories }) => categories.length === 0) && (
              <NoCategories
                offerStarterSet={everyGroup.length === 0}
                changes={firstCategoryChanges}
                onAdded={() => onEditingChange(true)}
                onError={setError}
              />
            )}
            {coached && (
              <p className={styles.coach}>
                Start at the top with what's due soonest.{" "}
                {wide
                  ? `Type what ${coached.name} needs in its Assigned column.`
                  : `Tap ${coached.name} and give it what it needs.`}
              </p>
            )}
            <Rows
              coachedCategoryId={coached?.id}
              groups={groups}
              month={month}
              currency={currency}
              onAssign={(categoryId, amount) =>
                attempt(() => onAssign({ categoryId, month, amount }))
              }
              onError={setError}
              onOpenCategory={(categoryId) => {
                const ids = groups.flatMap(({ categories }) =>
                  categories.map(({ id }) => id),
                );
                setSteps({
                  title: "Categories",
                  ids,
                  start: ids.indexOf(categoryId),
                });
              }}
              onAssignGroup={({ name, categories }) =>
                setSteps({
                  title: `Assign ${name}`,
                  ids: categories.map(({ id }) => id),
                  start: 0,
                })
              }
            />
          </div>
        </section>
      )}
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
      {flow === "walk" && (
        <AssignWalk
          key={month}
          month={month}
          currency={currency}
          wide={wide}
          onClose={() => setFlow(undefined)}
          onCopy={(unticked) => onCopyLastMonth(month, unticked)}
          onAssign={(categoryId, amount) =>
            onAssign({ categoryId, month, amount })
          }
          onMove={(fromCategoryId, toCategoryId, amount) =>
            onMoveMoney({ fromCategoryId, toCategoryId, amount, month })
          }
        />
      )}
      {flow === "copy" && (
        <CopyLastMonth
          key={month}
          month={month}
          currency={currency}
          onClose={() => setFlow(undefined)}
          onCopy={(unticked) => onCopyLastMonth(month, unticked)}
        />
      )}
      {/* Stands in until Move money has its own dialog (#107). */}
      {!editing && (
        <div className={styles.standIn}>
          <MoveMoneyForm
            currency={currency}
            onMove={(input) => attempt(() => onMoveMoney({ ...input, month }))}
            onError={setError}
          />
        </div>
      )}
    </div>
  );
}
