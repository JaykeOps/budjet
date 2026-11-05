import { useState } from "react";
import { type Currency, formatMoney } from "../../kernel/money";
import { type Month, monthNameAlone, previousMonth } from "../../kernel/month";
import { copyPreview, walkQueue } from "./assign-walk";
import {
  type Actions,
  SheetFrame,
  type SheetSteps,
  Steps,
} from "./CategorySheet";
import styles from "./CategorySheet.module.css";
import { type SheetBudget, useSheetBudget } from "./category-sheet";

type OnCopy = (unticked: ReadonlySet<string>) => void;

/** Assign: offers Copy last Month if it would fill anything, then walks what's left. */
export function AssignWalk({
  month,
  currency,
  wide,
  onClose,
  onCopy,
  ...actions
}: Actions & {
  month: Month;
  currency: Currency;
  wide: boolean;
  onClose: () => void;
  onCopy: OnCopy;
}) {
  const budget = useSheetBudget(month, currency);
  const [offering, setOffering] = useState(
    () => copyPreview(budget, new Set()).lines.length > 0,
  );
  const title = `Assign ${monthNameAlone(month)}`;

  return (
    <SheetFrame title={title} onClose={onClose}>
      {offering ? (
        <CopyPreview
          budget={budget}
          month={month}
          offer
          onCopy={onCopy}
          onCopied={() => setOffering(false)}
          onNotNow={() => setOffering(false)}
        />
      ) : (
        <WalkSteps
          budget={budget}
          title={title}
          month={month}
          currency={currency}
          wide={wide}
          onDone={onClose}
          {...actions}
        />
      )}
    </SheetFrame>
  );
}

/** Fixes the list once, after any copying, so saving doesn't reshuffle it. */
function WalkSteps({
  budget,
  title,
  ...props
}: Actions & {
  budget: SheetBudget;
  title: string;
  month: Month;
  currency: Currency;
  wide: boolean;
  onDone: () => void;
}) {
  const [steps] = useState<SheetSteps>(() => ({
    title,
    ids: walkQueue(budget),
    start: 0,
    walk: true,
  }));
  return <Steps steps={steps} {...props} />;
}

/** Copy last Month on its own, from the Budget's header. */
export function CopyLastMonth({
  month,
  currency,
  onClose,
  onCopy,
}: {
  month: Month;
  currency: Currency;
  onClose: () => void;
  onCopy: OnCopy;
}) {
  const budget = useSheetBudget(month, currency);
  return (
    <SheetFrame
      title={`Copy ${monthNameAlone(previousMonth(month))}`}
      onClose={onClose}
    >
      <CopyPreview
        budget={budget}
        month={month}
        onCopy={onCopy}
        onCopied={onClose}
      />
    </SheetFrame>
  );
}

function CopyPreview({
  budget,
  month,
  offer = false,
  onCopy,
  onCopied,
  onNotNow,
}: {
  budget: SheetBudget;
  month: Month;
  /** The walk's opening offer, which is worded as one. */
  offer?: boolean;
  onCopy: OnCopy;
  onCopied: () => void;
  onNotNow?: () => void;
}) {
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string>();
  const { lines, copying, readyToAssignAfter, warning } = copyPreview(
    budget,
    unticked,
  );
  const thisMonth = monthNameAlone(month);
  const lastMonth = monthNameAlone(previousMonth(month));

  function toggle(id: string) {
    const next = new Set(unticked);
    if (!next.delete(id)) next.add(id);
    setUnticked(next);
  }

  function copy() {
    try {
      onCopy(unticked);
      onCopied();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  if (lines.length === 0) {
    return (
      <div className={styles.body}>
        <p className={styles.copyIntro}>
          There's nothing to copy. Copy last Month only fills Categories with
          nothing assigned in {thisMonth}, from what you assigned in {lastMonth}
          .
        </p>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.body}>
        <p className={styles.copyIntro}>
          {offer
            ? `${
                lines.length === 1
                  ? "1 Category has"
                  : `${lines.length} Categories have`
              } nothing assigned in ${thisMonth} yet. Start them from what you assigned in ${lastMonth}, then check what's left.`
            : `Fills each Category with nothing assigned in ${thisMonth} with what you assigned in ${lastMonth}. Categories you've already assigned keep their amount.`}
        </p>
        <ul className={styles.copyList}>
          {lines.map(({ id, name, amount, ticked }) => (
            <li key={id}>
              <label className={styles.copyRow}>
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={() => toggle(id)}
                />
                <span className={styles.copyName}>
                  <strong>{name}</strong>
                  <span className={styles.small}>
                    {lastMonth}: {formatMoney(amount)}
                  </span>
                </span>
                <span>+{formatMoney(amount)}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className={styles.after} aria-live="polite">
          <p>
            <span>Ready to Assign after</span>
            <strong>{formatMoney(readyToAssignAfter)}</strong>
          </p>
          {warning && <p className={styles.warning}>{warning}</p>}
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className={styles.foot}>
        {onNotNow && (
          <button type="button" className={styles.quiet} onClick={onNotNow}>
            Not now
          </button>
        )}
        <button
          type="button"
          className={styles.main}
          disabled={copying === 0}
          onClick={copy}
        >
          Copy {copying} {copying === 1 ? "Assignment" : "Assignments"}
        </button>
      </div>
    </div>
  );
}
