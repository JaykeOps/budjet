import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import {
  type Currency,
  formatMoney,
  type Money,
  money,
} from "../../kernel/money";
import { monthOf } from "../../kernel/month";
import { type Account, useAccounts } from "../accounts";
import type { TransactionInput } from "./commands";
import { useCategoryChoices, useKnownPayees } from "./hooks";
import styles from "./RecordTransactionSheet.module.css";
import {
  type CategoryChoices,
  type Direction,
  type Draft,
  dayBefore,
  draftAmount,
  matchingPayees,
  today,
  withDirection,
  withPayee,
} from "./record-flow";

type Step = "amount" | "category" | "review";

const STEPS: Record<
  Step,
  { number: number; title: (direction: Direction) => string }
> = {
  amount: { number: 1, title: () => "How much?" },
  category: {
    number: 2,
    title: (direction) =>
      direction === "in" ? "Where does it go?" : "What was it for?",
  },
  review: { number: 3, title: () => "Anything else?" },
};

const added = (a: Money, minorUnits: number) =>
  money(a.minorUnits + minorUnits, a.currency);

const signed = (amount: Money) =>
  `${amount.minorUnits > 0 ? "+" : ""}${formatMoney(amount)}`;

/**
 * Records a Transaction one thing at a time: the amount, its Category, then the
 * rest. Going back to an earlier step from the review returns to the review.
 * The app shell decides what recording does; an error it throws is shown here.
 */
export function RecordTransactionSheet({
  currency,
  defaultAccountId,
  onRecord,
  onClose,
}: {
  currency: Currency;
  defaultAccountId?: string;
  onRecord: (input: TransactionInput) => void;
  onClose: () => void;
}) {
  const open = useAccounts().filter(({ closed }) => !closed);
  const [draft, setDraft] = useState<Draft>(() => ({
    direction: "out",
    typed: "",
    payee: "",
    date: today(),
    accountId: defaultAccountId ?? open[0]?.id ?? "",
  }));
  const [path, setPath] = useState<Step[]>(["amount"]);
  const step = path.at(-1) ?? "amount";
  const amount = draftAmount(draft, currency);
  const dialog = useRef<HTMLElement>(null);

  // The button that moved on has gone, so focus starts the new step. The amount
  // step's field takes it instead, to bring up the keyboard.
  const opening = useRef(true);
  useEffect(() => {
    if (!opening.current && step !== "amount") dialog.current?.focus();
    opening.current = false;
  }, [step]);

  /** On to the next step, or back to the review if this step came from it. */
  const finish = (next: Step) =>
    setPath((walked) =>
      walked.includes("review")
        ? walked.slice(0, walked.indexOf("review") + 1)
        : [...walked, next],
    );
  const goTo = (to: Step) => setPath((walked) => [...walked, to]);

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      className={styles.overlay}
    >
      <Modal className={styles.sheet}>
        <Dialog ref={dialog} className={styles.dialog}>
          <div className={styles.head}>
            {path.length > 1 ? (
              <button
                type="button"
                className={styles.link}
                onClick={() => setPath(path.slice(0, -1))}
              >
                ‹ Back
              </button>
            ) : (
              <span />
            )}
            <div className={styles.titled}>
              <Heading slot="title" className={styles.title}>
                {STEPS[step].title(draft.direction)}
              </Heading>
              <p className={styles.step}>{STEPS[step].number} of 3</p>
            </div>
            <Button className={styles.close} slot="close">
              Close
            </Button>
          </div>
          {step === "amount" && (
            <AmountStep
              draft={draft}
              currency={currency}
              canContinue={amount !== undefined}
              onChange={setDraft}
              onNext={() => finish("category")}
            />
          )}
          {step === "category" && amount && (
            <CategoryStep
              draft={draft}
              amount={amount}
              onPick={(categoryId) => {
                setDraft({ ...draft, categoryId });
                finish("review");
              }}
            />
          )}
          {step === "review" && amount && (
            <ReviewStep
              draft={draft}
              amount={amount}
              accounts={open}
              onChange={setDraft}
              onAmount={() => goTo("amount")}
              onCategory={() => goTo("category")}
              onRecord={(input) => {
                onRecord(input);
                onClose();
              }}
            />
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function AmountStep({
  draft,
  currency,
  canContinue,
  onChange,
  onNext,
}: {
  draft: Draft;
  currency: Currency;
  canContinue: boolean;
  onChange: (draft: Draft) => void;
  onNext: () => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (canContinue) onNext();
  }
  return (
    <form className={styles.body} onSubmit={submit}>
      <fieldset className={styles.choices}>
        <legend className={styles.hidden}>Money out or in?</legend>
        {(["out", "in"] as const).map((direction) => (
          <label key={direction} className={styles.choice}>
            <input
              type="radio"
              name="direction"
              checked={draft.direction === direction}
              onChange={() => onChange(withDirection(draft, direction))}
            />
            {direction === "out" ? "Money out" : "Money in"}
          </label>
        ))}
      </fieldset>
      <label className={styles.amount} data-direction={draft.direction}>
        <span className={styles.hidden}>Amount</span>
        <span aria-hidden>
          {draft.direction === "out" ? "−" : "+"}
          {currencySign(currency)}
        </span>
        <input
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
          // biome-ignore lint/a11y/noAutofocus: this step is the amount, and it brings up the phone's number keyboard
          autoFocus
        />
      </label>
      <button type="submit" className={styles.main} disabled={!canContinue}>
        Next
      </button>
    </form>
  );
}

function currencySign(currency: Currency): string {
  return (
    new Intl.NumberFormat(undefined, { style: "currency", currency })
      .formatToParts(0)
      .find(({ type }) => type === "currency")?.value ?? currency
  );
}

const READY_TO_ASSIGN = "Ready to Assign";

function CategoryStep({
  draft,
  amount,
  onPick,
}: {
  draft: Draft;
  amount: Money;
  onPick: (categoryId: string | undefined) => void;
}) {
  const [search, setSearch] = useState("");
  const { readyToAssign, groups } = useCategoryChoices(
    monthOf(draft.date),
    amount.currency,
  );
  const found = (name: string) =>
    name.toLowerCase().includes(search.trim().toLowerCase());
  const shown = groups
    .map((group) => ({
      ...group,
      categories: group.categories.filter(({ name }) => found(name)),
    }))
    .filter(({ categories }) => categories.length > 0);
  const offersReadyToAssign =
    draft.direction === "in" && found(READY_TO_ASSIGN);
  const size = Math.abs(amount.minorUnits);

  return (
    <div className={styles.body}>
      <input
        type="search"
        className={styles.search}
        aria-label="Find a Category"
        placeholder="Find a Category"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <p className={styles.note}>
        {formatMoney(money(size, amount.currency))} {draft.direction}. Each
        Category shows what it has now, and after this.
      </p>
      {offersReadyToAssign && (
        <ul className={styles.list}>
          <CategoryRow
            name={READY_TO_ASSIGN}
            detail="Income, like a paycheck"
            now={readyToAssign}
            after={added(readyToAssign, amount.minorUnits)}
            chosen={false}
            onPick={() => onPick(undefined)}
          />
        </ul>
      )}
      {shown.map((group) => (
        <section key={group.id} aria-label={group.name}>
          <h3 className={styles.group}>{group.name}</h3>
          <ul className={styles.list}>
            {group.categories.map(({ id, name, available }) => (
              <CategoryRow
                key={id}
                name={name}
                tile
                now={available}
                after={added(available, amount.minorUnits)}
                chosen={draft.categoryId === id}
                onPick={() => onPick(id)}
              />
            ))}
          </ul>
        </section>
      ))}
      {shown.length === 0 && !offersReadyToAssign && (
        <p className={styles.note}>No Category called "{search.trim()}".</p>
      )}
    </div>
  );
}

function CategoryRow({
  name,
  detail,
  tile,
  now,
  after,
  chosen,
  onPick,
}: {
  name: string;
  detail?: string;
  tile?: boolean;
  now: Money;
  after: Money;
  chosen: boolean;
  onPick: () => void;
}) {
  const state =
    after.minorUnits < 0
      ? "overspent"
      : after.minorUnits === 0
        ? "zero"
        : "available";
  return (
    <li>
      <button
        type="button"
        className={styles.row}
        aria-pressed={chosen}
        onClick={onPick}
      >
        {tile && (
          <span className={styles.tile} aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className={styles.rowName}>
          {name}
          {detail && <span className={styles.note}>{detail}</span>}
        </span>
        <span className={styles.now}>
          {formatMoney(now)}
          <span className={styles.hidden}> now</span>
        </span>
        <span className={styles.pill} data-state={state}>
          {formatMoney(after)}
          <span className={styles.hidden}> after this</span>
        </span>
      </button>
    </li>
  );
}

function ReviewStep({
  draft,
  amount,
  accounts,
  onChange,
  onAmount,
  onCategory,
  onRecord,
}: {
  draft: Draft;
  amount: Money;
  accounts: Account[];
  onChange: (draft: Draft) => void;
  onAmount: () => void;
  onCategory: () => void;
  onRecord: (input: TransactionInput) => void;
}) {
  const [error, setError] = useState<string>();
  const { readyToAssign, groups } = useCategoryChoices(
    monthOf(draft.date),
    amount.currency,
  );
  const account = accounts.find(({ id }) => id === draft.accountId);
  const moneyIn = draft.direction === "in";
  const canRecord = account && (moneyIn || draft.categoryId !== undefined);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canRecord) return;
    try {
      onRecord({
        accountId: draft.accountId,
        date: draft.date,
        amount,
        categoryId: draft.categoryId,
        payee: draft.payee,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  const category = groups
    .flatMap(({ categories }) => categories)
    .find(({ id }) => id === draft.categoryId);
  return (
    <form className={styles.body} onSubmit={submit}>
      <div className={styles.summary}>
        <button type="button" className={styles.line} onClick={onAmount}>
          <span className={styles.note}>
            {moneyIn ? "Money in" : "Money out"}
          </span>
          <span className={styles.summaryAmount}>{signed(amount)}</span>
        </button>
        <button type="button" className={styles.line} onClick={onCategory}>
          <span className={styles.note}>
            {moneyIn ? "Goes to" : "Category"}
          </span>
          <span>
            {category?.name ??
              (moneyIn ? READY_TO_ASSIGN : "Choose a Category")}
          </span>
        </button>
        <AfterThis
          amount={amount}
          category={category}
          readyToAssign={readyToAssign}
          moneyIn={moneyIn}
        />
      </div>
      <PayeeField draft={draft} onChange={onChange} />
      <DateField
        date={draft.date}
        onChange={(date) => onChange({ ...draft, date })}
      />
      <label className={styles.field}>
        Account
        <select
          value={draft.accountId}
          onChange={(event) =>
            onChange({ ...draft, accountId: event.target.value })
          }
        >
          {accounts.map(({ id, name, balance }) => (
            <option key={id} value={id}>
              {name} · {formatMoney(balance)}
            </option>
          ))}
        </select>
      </label>
      {!account && (
        <p className={styles.note}>Add an Account to record this.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" className={styles.main} disabled={!canRecord}>
        Record
      </button>
    </form>
  );
}

/** What the chosen Category, or Ready to Assign, has after this. */
function AfterThis({
  amount,
  category,
  readyToAssign,
  moneyIn,
}: {
  amount: Money;
  category?: CategoryChoices["groups"][number]["categories"][number];
  readyToAssign: Money;
  moneyIn: boolean;
}) {
  if (!category && !moneyIn) {
    return (
      <p className={styles.note}>Choose a Category to see what it has left.</p>
    );
  }
  const after = added(
    category ? category.available : readyToAssign,
    amount.minorUnits,
  );
  const overspent = after.minorUnits < 0;
  return (
    <p className={styles.after} aria-live="polite">
      <span>{category?.name ?? READY_TO_ASSIGN} after this</span>
      <strong data-overspent={overspent && category !== undefined}>
        {!category
          ? formatMoney(after)
          : overspent
            ? `Overspent by ${formatMoney(money(-after.minorUnits, after.currency))}`
            : `${formatMoney(after)} left`}
      </strong>
    </p>
  );
}

function PayeeField({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  const known = useKnownPayees();
  const field = useRef<HTMLInputElement>(null);
  const matches = matchingPayees(draft.payee, known);
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.field}>
        Payee
        <input
          ref={field}
          autoComplete="off"
          placeholder="Who was it?"
          value={draft.payee}
          onChange={(event) =>
            onChange(withPayee(draft, event.target.value, known))
          }
        />
      </label>
      {matches.length > 0 && (
        <div className={styles.chips}>
          {matches.map(({ name }) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onChange(withPayee(draft, name, known));
                field.current?.focus();
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DateField({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  const now = today();
  const yesterday = dayBefore(now);
  const another = date !== now && date !== yesterday;
  return (
    <fieldset className={styles.dates}>
      <legend>Date</legend>
      <button
        type="button"
        aria-pressed={date === now}
        onClick={() => onChange(now)}
      >
        Today
      </button>
      <button
        type="button"
        aria-pressed={date === yesterday}
        onClick={() => onChange(yesterday)}
      >
        Yesterday
      </button>
      <label className={styles.anotherDay} data-chosen={another}>
        {another ? shortDate(date) : "Another day"}
        <input
          type="date"
          aria-label="Another day"
          value={date}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
        />
      </label>
    </fieldset>
  );
}

/** A date as a chip shows it, such as "Oct 3". */
function shortDate(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
