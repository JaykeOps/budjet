import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type Currency,
  formatMoney,
  type Money,
  money,
} from "../../kernel/money";
import { monthOf } from "../../kernel/month";
import { ComboBox, type ComboBoxOption } from "../../ui/ComboBox";
import { useAccounts } from "../accounts";
import {
  type TransferDraft,
  type TransferInput,
  TransferRowFields,
  TransferRowLine,
  transferRowDraft,
  transferRowInput,
} from "../transfers";
import type { TransactionInput } from "./commands";
import { useCategoryChoices, useKnownPayees } from "./hooks";
import styles from "./RecordRow.module.css";
import {
  afterThis,
  type CategoryChoices,
  type Direction,
  type Draft,
  draftAmount,
  matchingPayees,
  missingField,
  nextDraft,
  today,
  withDirection,
  withPayee,
} from "./record-flow";

const READY_TO_ASSIGN = "ready-to-assign";

const added = (a: Money, change: number) =>
  money(a.minorUnits + change, a.currency);

/**
 * Records several Transactions or Transfers by keyboard: a row above the
 * history where Enter records, clears for the next one and goes back to the
 * start, or moves to whatever is missing. Done or Esc closes it. The app shell
 * decides what recording does; an error it throws is shown here.
 */
export function RecordRow({
  currency,
  defaultAccountId,
  transfer,
  focusRequest,
  onBack,
  onRecord,
  onTransfer,
  onClose,
}: {
  currency: Currency;
  defaultAccountId?: string;
  /** Starts it as a Transfer, with what's known so far. */
  transfer?: TransferDraft;
  /** Changing it moves focus back to the row's first field. */
  focusRequest: number;
  /** Where it was started from, to go back to the Budget. */
  onBack?: () => void;
  onRecord: (input: TransactionInput) => void;
  onTransfer: (input: TransferInput) => void;
  onClose: () => void;
}) {
  const open = useAccounts().filter(({ closed }) => !closed);
  const startAccount = defaultAccountId ?? open[0]?.id ?? "";
  const [kind, setKind] = useState(transfer ? "transfer" : "transaction");
  const [draft, setDraft] = useState<Draft>(() => ({
    direction: "out",
    typed: "",
    payee: "",
    date: today(),
    accountId: startAccount,
  }));
  const [moving, setMoving] = useState(() =>
    transferRowDraft(
      transfer ?? { fromAccountId: startAccount },
      open,
      today(),
    ),
  );
  const [error, setError] = useState<string>();
  const payeeField = useRef<HTMLInputElement>(null);
  const categoryField = useRef<HTMLInputElement>(null);
  const amountField = useRef<HTMLInputElement>(null);
  const first = () =>
    (kind === "transfer" ? amountField : payeeField).current?.focus();

  // biome-ignore lint/correctness/useExhaustiveDependencies: asking again is what it runs on.
  useEffect(first, [focusRequest]);

  function attempt(act: () => void): boolean {
    try {
      act();
      setError(undefined);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    }
  }

  function submitTransaction() {
    (window as unknown as { __diag?: string[]; __last?: unknown }).__last = draft;
    (window as unknown as { __diag?: string[] }).__diag?.push(`${performance.now().toFixed(1)} SUBMIT ${JSON.stringify(draft)}`);
    const missing = missingField(draft, currency);
    if (missing === "category") return categoryField.current?.focus();
    const amount = draftAmount(draft, currency);
    if (!amount) return amountField.current?.focus();
    const { accountId, date, categoryId, payee } = draft;
    const input = { accountId, date, amount, categoryId, payee };
    if (attempt(() => onRecord(input))) {
      setDraft(nextDraft(draft));
      payeeField.current?.focus();
    }
  }

  function submitTransfer() {
    const input = transferRowInput(moving, currency);
    if (!input) return amountField.current?.focus();
    if (attempt(() => onTransfer(input))) {
      setMoving({ ...moving, typed: "" });
      amountField.current?.focus();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === "transfer") submitTransfer();
    else submitTransaction();
  }

  function keys(event: KeyboardEvent<HTMLFormElement>) {
    const target = event.target as HTMLElement;
    if (event.key === "Escape") {
      // An open list of options takes the first Esc for itself.
      if (target.getAttribute("aria-expanded") === "true") return;
      event.preventDefault();
      onClose();
    }
    // Enter in an input records by itself, but not in a select.
    if (event.key === "Enter" && target.tagName === "SELECT") {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  return (
    <form
      aria-label="Record"
      className={styles.row}
      onSubmit={submit}
      onKeyDownCapture={keys}
    >
      <div className={styles.head}>
        {onBack ? (
          <button type="button" className={styles.back} onClick={onBack}>
            ‹ Back to Budget
          </button>
        ) : (
          <span />
        )}
        <fieldset className={styles.kinds}>
          <legend className={styles.hidden}>What to record</legend>
          {(["transaction", "transfer"] as const).map((each) => (
            <button
              key={each}
              type="button"
              className={styles.kind}
              aria-pressed={kind === each}
              onClick={() => setKind(each)}
            >
              {each === "transfer" ? "Transfer" : "Transaction"}
            </button>
          ))}
        </fieldset>
      </div>
      <div className={styles.cells}>
        {kind === "transfer" ? (
          <TransferRowFields
            draft={moving}
            accounts={open}
            amountField={amountField}
            onChange={setMoving}
          />
        ) : (
          <TransactionFields
            draft={draft}
            currency={currency}
            payeeField={payeeField}
            categoryField={categoryField}
            amountField={amountField}
            onChange={setDraft}
          />
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className={styles.foot}>
        <div className={styles.line} aria-live="polite">
          {kind === "transaction" ? (
            <AfterLine draft={draft} currency={currency} />
          ) : (
            <TransferRowLine
              draft={moving}
              accounts={open}
              currency={currency}
            />
          )}
        </div>
        <div className={styles.buttons}>
          <button type="button" onClick={onClose}>
            Done
          </button>
          <button type="submit">
            Record{" "}
            <kbd aria-hidden className={styles.key}>
              ↵
            </kbd>
          </button>
        </div>
      </div>
    </form>
  );
}

function TransactionFields({
  draft,
  currency,
  payeeField,
  categoryField,
  amountField,
  onChange,
}: {
  draft: Draft;
  currency: Currency;
  payeeField: RefObject<HTMLInputElement | null>;
  categoryField: RefObject<HTMLInputElement | null>;
  amountField: RefObject<HTMLInputElement | null>;
  onChange: (draft: Draft) => void;
}) {
  const open = useAccounts().filter(({ closed }) => !closed);
  const amountId = useId();
  const known = useKnownPayees();
  const choices = useCategoryChoices(monthOf(draft.date), currency);
  const switchTo = (direction: Direction) =>
    onChange(withDirection(draft, direction));
  return (
    <>
      <ComboBox
        label="Payee"
        placeholder="Who was it?"
        inputRef={payeeField}
        value={draft.payee}
        options={matchingPayees(draft.payee, known).map(({ name }) => ({
          id: name,
          name,
        }))}
        onValue={(payee) => onChange(withPayee(draft, payee, known))}
        onSelect={(payee) => {
          if (payee) onChange(withPayee(draft, payee, known));
        }}
      />
      <ComboBox
        // Its choice and its options both change with direction, and without
        // starting afresh its text only catches up after the next paint. Arriving
        // before then, what's typed lands after that text instead of replacing it.
        key={draft.direction}
        label={draft.direction === "in" ? "Goes to" : "Category"}
        placeholder="Type to find one"
        inputRef={categoryField}
        selectedId={
          draft.categoryId ??
          (draft.direction === "in" ? READY_TO_ASSIGN : null)
        }
        options={categoryOptions(draft, currency, choices)}
        onSelect={(id) => {
          const { categoryId: _, ...rest } = draft;
          onChange(
            id && id !== READY_TO_ASSIGN ? { ...rest, categoryId: id } : rest,
          );
        }}
        onPicked={() => amountField.current?.focus()}
      />
      <div className={styles.field}>
        <label htmlFor={amountId}>Amount</label>
        <span className={styles.amount} data-direction={draft.direction}>
          <button
            type="button"
            tabIndex={-1}
            className={styles.sign}
            aria-label={
              draft.direction === "out"
                ? "Money out. Switch to money in"
                : "Money in. Switch to money out"
            }
            onClick={() => switchTo(draft.direction === "out" ? "in" : "out")}
          >
            {draft.direction === "out" ? "−" : "+"}
          </button>
          <input
            id={amountId}
            ref={amountField}
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
            value={draft.typed}
            onChange={(event) =>
              onChange({
                ...draft,
                typed: event.target.value.replace(/[^\d.,]/g, ""),
              })
            }
            onKeyDown={(event) => {
              if (event.key !== "+" && event.key !== "-") return;
              event.preventDefault();
              switchTo(event.key === "+" ? "in" : "out");
            }}
          />
        </span>
      </div>
      <label className={styles.field}>
        Date
        <input
          type="date"
          required
          value={draft.date}
          onChange={(event) => {
            if (event.target.value)
              onChange({ ...draft, date: event.target.value });
          }}
        />
      </label>
      <label className={styles.field}>
        Account
        <select
          value={draft.accountId}
          onChange={(event) =>
            onChange({ ...draft, accountId: event.target.value })
          }
        >
          {open.map(({ id, name, balance }) => (
            <option key={id} value={id}>
              {name} · {formatMoney(balance)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Every Category with what it has now and after this. Money in starts with Ready to Assign. */
function categoryOptions(
  draft: Draft,
  currency: Currency,
  { readyToAssign, groups }: CategoryChoices,
): ComboBoxOption[] {
  const change = draftAmount(draft, currency)?.minorUnits ?? 0;
  const option = (
    id: string,
    name: string,
    detail: string | undefined,
    now: Money,
  ): ComboBoxOption => ({
    id,
    name,
    content: (
      <CategoryOption
        name={name}
        detail={detail}
        now={now}
        after={added(now, change)}
      />
    ),
  });
  return [
    ...(draft.direction === "in"
      ? [option(READY_TO_ASSIGN, "Ready to Assign", undefined, readyToAssign)]
      : []),
    ...groups.flatMap((group) =>
      group.categories.map(({ id, name, available }) =>
        option(id, name, group.name, available),
      ),
    ),
  ];
}

function CategoryOption({
  name,
  detail,
  now,
  after,
}: {
  name: string;
  detail?: string;
  now: Money;
  after: Money;
}) {
  const state =
    after.minorUnits < 0
      ? "overspent"
      : after.minorUnits === 0
        ? "zero"
        : "available";
  return (
    <span className={styles.option}>
      <span className={styles.optionName}>
        {name}
        {detail && <span className={styles.muted}> {detail}</span>}
      </span>
      <span className={styles.numbers}>
        <span className={styles.muted}>{formatMoney(now)}</span>
        <span className={styles.pill} data-state={state}>
          {formatMoney(after)}
        </span>
      </span>
    </span>
  );
}

function AfterLine({ draft, currency }: { draft: Draft; currency: Currency }) {
  const choices = useCategoryChoices(monthOf(draft.date), currency);
  const line = afterThis(draft, currency, choices);
  if (!line) return <>Choose a Category to see what it has left.</>;
  const { name, after } = line;
  const words =
    name !== "Ready to Assign" && after.minorUnits < 0
      ? `Overspent by ${formatMoney(money(-after.minorUnits, currency))}`
      : name === "Ready to Assign"
        ? formatMoney(after)
        : `${formatMoney(after)} left`;
  return (
    <>
      {name} after this:{" "}
      <strong data-overspent={after.minorUnits < 0}>{words}</strong>
    </>
  );
}
