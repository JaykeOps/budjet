import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import {
  addMoney,
  type Currency,
  formatMoney,
  type Money,
  money,
  parseMoney,
  subtractMoney,
  typedMoney,
} from "../../kernel/money";
import { type Month, monthNameAlone } from "../../kernel/month";
import styles from "./CategorySheet.module.css";
import {
  assignPreview,
  breakdown,
  groupsOf,
  mainButton,
  movePreview,
  type SheetBudget,
  type SheetCategory,
  type SheetChange,
  type Suggestion,
  shortBy,
  suggestions,
  useSheetBudget,
} from "./category-sheet";
import { type CoverCandidate, coveringSource } from "./covering-source";

/** Which Categories the sheet steps through, in order, and where it starts. */
export type SheetSteps = { title: string; ids: string[]; start: number };

type Actions = {
  /** Either may throw when refused; the sheet shows why and stays put. */
  onAssign: (categoryId: string, amount: Money) => void;
  onMove: (fromCategoryId: string, toCategoryId: string, amount: Money) => void;
};

/**
 * Shows how a Category's Available adds up, and stays open as the user assigns
 * and moves on: a sheet rising from the bottom of a phone, a side panel on
 * desktop. Closing it returns focus to whatever opened it.
 */
export function CategorySheet({
  steps,
  month,
  currency,
  wide,
  onClose,
  ...actions
}: Actions & {
  steps: SheetSteps;
  month: Month;
  currency: Currency;
  wide: boolean;
  onClose: () => void;
}) {
  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className={styles.overlay}
    >
      <Modal className={styles.sheet}>
        <Dialog className={styles.dialog}>
          <div className={styles.head}>
            <Button className={styles.close} slot="close">
              Close
            </Button>
            <Heading slot="title" className={styles.title}>
              {steps.title}
            </Heading>
          </div>
          <Steps
            steps={steps}
            month={month}
            currency={currency}
            wide={wide}
            onDone={onClose}
            {...actions}
          />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

const SWIPE_ACROSS = 60;
const SWIPE_ALONG = 40;

function Steps({
  steps: { ids, start },
  month,
  currency,
  wide,
  onDone,
  ...actions
}: Actions & {
  steps: SheetSteps;
  month: Month;
  currency: Currency;
  wide: boolean;
  onDone: () => void;
}) {
  const budget = useSheetBudget(month, currency);
  const [index, setIndex] = useState(start);
  const swipe = useRef<{ x: number; y: number }>(undefined);
  // Another device can hide or delete a Category while this is open.
  const present = ids.filter((id) =>
    budget.categories.some((category) => category.id === id),
  );
  const at = Math.min(index, present.length - 1);
  const category = budget.categories.find(({ id }) => id === present[at]);
  if (!category) return null;

  const first = at === 0;
  const last = at === present.length - 1;
  const look = (to: number) => {
    if (to >= 0 && to < present.length) setIndex(to);
  };

  return (
    // These only add ways to move; the buttons do the same by name.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above
    <div
      className={styles.steps}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLSelectElement) return;
        if (event.key === "ArrowDown") look(at + 1);
        else if (event.key === "ArrowUp") look(at - 1);
        else return;
        event.preventDefault();
      }}
      onPointerDown={({ clientX: x, clientY: y }) => {
        swipe.current = { x, y };
      }}
      onPointerUp={({ clientX, clientY }) => {
        if (wide || !swipe.current) return;
        const across = clientX - swipe.current.x;
        const along = Math.abs(clientY - swipe.current.y);
        if (Math.abs(across) > SWIPE_ACROSS && along < SWIPE_ALONG) {
          look(across < 0 ? at + 1 : at - 1);
        }
      }}
    >
      <div className={styles.nav}>
        {wide && (
          <button
            type="button"
            className={styles.arrow}
            aria-label="Previous Category"
            disabled={first}
            onClick={() => look(at - 1)}
          >
            ‹
          </button>
        )}
        <p className={styles.where} aria-live="polite">
          <strong className={styles.name}>{category.name}</strong>
          <span className={styles.small}>
            {category.groupName} · {at + 1} of {present.length}
          </span>
        </p>
        {wide && (
          <button
            type="button"
            className={styles.arrow}
            aria-label="Skip to next Category"
            disabled={last}
            onClick={() => look(at + 1)}
          >
            ›
          </button>
        )}
      </div>
      <p className={styles.readyToAssign}>
        <span>Ready to Assign</span>
        <strong>{formatMoney(budget.readyToAssign)}</strong>
      </p>
      <StepForm
        // Each Category starts afresh, with its own amount selected.
        key={category.id}
        category={category}
        budget={budget}
        month={month}
        currency={currency}
        last={last}
        tip={
          wide
            ? "Suggestions save and move on. Use ‹ › or ↑ ↓ to look at another Category."
            : "Suggestions save and move on. Swipe to skip ahead or go back."
        }
        onNext={() => (last ? onDone() : look(at + 1))}
        onBack={first ? undefined : () => look(at - 1)}
        showBack={!wide}
        {...actions}
      />
    </div>
  );
}

function candidates({ categories }: SheetBudget): CoverCandidate[] {
  return categories.map(({ id, groupId, row }) => ({
    id,
    groupId,
    assigned: row.assigned,
    available: row.available,
  }));
}

/** One Category: type and press Enter or the keyboard's Next, or tap a suggestion. */
function StepForm({
  category,
  budget,
  month,
  currency,
  last,
  tip,
  onNext,
  onBack,
  showBack,
  onAssign,
  onMove,
}: Actions & {
  category: SheetCategory;
  budget: SheetBudget;
  month: Month;
  currency: Currency;
  last: boolean;
  tip: string;
  onNext: () => void;
  /** Undefined on the first Category, where ‹ stays in place, disabled. */
  onBack: (() => void) | undefined;
  showBack: boolean;
}) {
  const { readyToAssign } = budget;
  const { row } = category;
  const { assigned } = row;
  const short = shortBy(row);
  const others = budget.categories.filter(({ id }) => id !== category.id);
  const suggestSource = () =>
    coveringSource(candidates(budget), category, short);

  // Overspent starts on what covers it, from wherever can pay for it.
  const [sourceId, setSourceId] = useState(() =>
    short.minorUnits > readyToAssign.minorUnits && short.minorUnits > 0
      ? suggestSource()
      : undefined,
  );
  const [typed, setTyped] = useState(() =>
    typedMoney(sourceId ? short : addMoney(assigned, short)),
  );
  const [error, setError] = useState<string>();
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus({ preventScroll: true });
    field.current?.select();
  }, []);

  const source = others.find(({ id }) => id === sourceId);
  const amount: Money | undefined =
    typed.trim() === "" ? money(0, currency) : parseMoney(typed, currency);
  const change = sheetChange(amount, assigned, source !== undefined);
  const monthName = monthNameAlone(month);

  function save(saved: Money) {
    try {
      if (source) onMove(source.id, category.id, saved);
      else onAssign(category.id, saved);
      onNext();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!amount) setError(`"${typed}" isn't an amount in ${currency}`);
    else if (change.kind === "unchanged") onNext();
    else save(amount);
  }

  const offered: Suggestion[] = source
    ? short.minorUnits > 0
      ? [{ label: `Cover it: ${formatMoney(short)}`, amount: short }]
      : []
    : suggestions(category, readyToAssign, month);
  const entered = amount ?? (source ? money(0, currency) : assigned);
  const preview = source
    ? movePreview(category, source, entered, month)
    : assignPreview(category, readyToAssign, entered, month);
  const after: [string, Money] =
    "sourceAfter" in preview
      ? [`${source?.name} Available after`, preview.sourceAfter]
      : ["Ready to Assign after", preview.readyToAssignAfter];

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.body}>
        <dl className={styles.breakdown}>
          {breakdown(row, month).map(({ label, amount: figure }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{figure}</dd>
            </div>
          ))}
        </dl>

        <fieldset className={styles.from}>
          <legend className={styles.forReaders}>
            Where the money comes from
          </legend>
          <button
            type="button"
            aria-pressed={!source}
            onClick={() => {
              setSourceId(undefined);
              setTyped(typedMoney(addMoney(assigned, short)));
            }}
          >
            Ready to Assign
          </button>
          <button
            type="button"
            aria-pressed={Boolean(source)}
            disabled={others.length === 0}
            onClick={() => {
              setSourceId(source?.id ?? suggestSource() ?? others[0]?.id);
              setTyped(typedMoney(short));
            }}
          >
            Another Category
          </button>
        </fieldset>

        {source && (
          <label className={styles.field}>
            Take it from
            <select
              value={source.id}
              onChange={(event) => setSourceId(event.target.value)}
            >
              {groupsOf(others).map(([groupName, members]) => (
                <optgroup key={groupName} label={groupName}>
                  {members.map(({ id, name, row: { available } }) => (
                    <option key={id} value={id}>
                      {name} ({formatMoney(available)} available)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        <div className={styles.field}>
          <label htmlFor={fieldId}>
            {source ? `Move to ${category.name}` : `Assigned in ${monthName}`}
          </label>
          <input
            ref={field}
            id={fieldId}
            className={styles.amount}
            inputMode="decimal"
            enterKeyHint={last ? "done" : "next"}
            autoComplete="off"
            placeholder="0"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(undefined);
            }}
            onFocus={(event) => event.target.select()}
          />
          {error && <p role="alert">{error}</p>}
          {offered.length > 0 && (
            <div className={styles.suggestions}>
              {offered.map(({ label, amount: suggested }) => (
                <button
                  key={label}
                  type="button"
                  className={styles.suggestion}
                  onClick={() => save(suggested)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.after} aria-live="polite">
          <p>
            <span>{category.name} Available after</span>
            <strong>{formatMoney(preview.availableAfter)}</strong>
          </p>
          <p>
            <span>{after[0]}</span>
            <strong>{formatMoney(after[1])}</strong>
          </p>
          {preview.note && <p className={styles.note}>{preview.note}</p>}
        </div>
        <p className={styles.tip}>{tip}</p>
      </div>
      <div className={styles.foot}>
        {showBack && (
          <button
            type="button"
            className={styles.arrow}
            aria-label="Previous Category"
            disabled={!onBack}
            onClick={onBack}
          >
            ‹
          </button>
        )}
        <button type="submit" className={styles.main}>
          {mainButton(change, last)}
        </button>
      </div>
    </form>
  );
}

function sheetChange(
  amount: Money | undefined,
  assigned: Money,
  moving: boolean,
): SheetChange {
  if (!amount) return { kind: "unchanged" };
  if (moving) {
    return amount.minorUnits === 0
      ? { kind: "unchanged" }
      : { kind: "move", by: amount };
  }
  const by = subtractMoney(amount, assigned);
  if (by.minorUnits === 0) return { kind: "unchanged" };
  return by.minorUnits > 0
    ? { kind: "raise", by }
    : { kind: "lower", by: subtractMoney(assigned, amount) };
}
