import type { ReactNode } from "react";
import { type Currency, formatMoney } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { assignPanel } from "./assign-panel";
import { useSheetBudget } from "./category-sheet";
import styles from "./MonthBudget.module.css";
import type { AssignedColumn } from "./use-assigned-column";

const HOW_AVAILABLE_ADDS_UP = "How Available adds up";

/** Under Ready to Assign: explains the row focused in the Assigned column. */
export function AssignPanel({
  column,
  month,
  currency,
}: {
  column: AssignedColumn;
  month: Month;
  currency: Currency;
}) {
  if (!column.panelShown) {
    return (
      <button
        ref={column.toggle}
        type="button"
        className={styles.panelToggle}
        onClick={column.togglePanel}
      >
        Show how Available adds up
      </button>
    );
  }
  return column.focusedId ? (
    <FocusedRow
      column={column}
      categoryId={column.focusedId}
      month={month}
      currency={currency}
    />
  ) : (
    <Frame column={column} title={HOW_AVAILABLE_ADDS_UP}>
      <Tip />
    </Frame>
  );
}

function Tip() {
  return (
    <p className={styles.small}>
      Click an amount in the Assigned column. This shows how that Category's
      Available is made up and what to assign. Enter, ↑ and ↓ move between
      Categories.
    </p>
  );
}

function Frame({
  column,
  title,
  children,
}: {
  column: AssignedColumn;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      ref={column.panel}
      className={styles.panel}
      aria-label="Explaining the focused row"
      onKeyDown={(event) => {
        if (event.key === "Escape") column.backToRow();
      }}
    >
      <div className={styles.panelHead}>
        <strong>{title}</strong>
        <button
          ref={column.toggle}
          type="button"
          className={styles.panelToggle}
          onClick={column.togglePanel}
        >
          Hide
        </button>
      </div>
      {children}
    </section>
  );
}

function FocusedRow({
  column,
  categoryId,
  month,
  currency,
}: {
  column: AssignedColumn;
  categoryId: string;
  month: Month;
  currency: Currency;
}) {
  const budget = useSheetBudget(month, currency);
  const category = budget.categories.find(({ id }) => id === categoryId);
  // Another device can hide or delete the Category while it's focused.
  if (!category) {
    return (
      <Frame column={column} title={HOW_AVAILABLE_ADDS_UP}>
        <Tip />
      </Frame>
    );
  }
  const { lines, note, readyToAssign, suggestions } = assignPanel(
    category,
    budget.readyToAssign,
    column.typed,
    month,
  );
  return (
    <Frame column={column} title={category.name}>
      <dl className={styles.panelBreakdown}>
        {lines.map(({ label, amount }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{amount}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.panelAfter} aria-live="polite">
        {note && <p className={styles.small}>{note}</p>}
        <p className={styles.small}>
          {readyToAssign.label}{" "}
          <strong>{formatMoney(readyToAssign.amount)}</strong>
        </p>
      </div>
      {suggestions.length > 0 && (
        <div className={styles.panelSuggestions}>
          {suggestions.map(({ label, amount }) => (
            <button
              key={label}
              type="button"
              data-suggestion
              className={styles.panelSuggestion}
              // Keeps focus in the field, so what's typed isn't saved first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => column.pick(category.id, amount)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </Frame>
  );
}
