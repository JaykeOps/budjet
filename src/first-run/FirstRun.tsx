import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  addMoney,
  type Currency,
  currencies,
  formatMoney,
  type Money,
  money,
  parseMoney,
} from "../kernel/money";
import { useChangeLogWriter } from "../kernel/use-change-log-query";
import type { AccountKind } from "../slices/accounts";
import { starterSet } from "../slices/categories/commands";
import { hasFolderPicker, shouldSuggestHomeScreen } from "./browser";
import styles from "./FirstRun.module.css";
import { guessCurrency } from "./guess-currency";
import { type CategoriesChoice, openMyBudget } from "./open-my-budget";

const STEPS = ["welcome", "currency", "categories", "accounts"] as const;
const STEPS_WITH_FOLDER = [
  "welcome",
  "folder",
  "currency",
  "categories",
  "accounts",
] as const;

const KINDS: readonly { kind: AccountKind; label: string }[] = [
  { kind: "checking", label: "Checking" },
  { kind: "savings", label: "Savings" },
  { kind: "cash", label: "Cash" },
];

/**
 * An Account being set up. The amount stays as typed, because Back can change
 * the currency, and the same text may then read differently or not at all.
 */
type AccountDraft = {
  name: string;
  kind: AccountKind;
  holds: string;
};
type AddedAccount = AccountDraft & { id: string };

const BLANK_DRAFT: AccountDraft = { name: "", kind: "checking", holds: "" };

/** A blank amount is zero. Undefined when the text isn't an amount in this currency. */
function readAmount(holds: string, currency: Currency): Money | undefined {
  return holds.trim() ? parseMoney(holds, currency) : money(0, currency);
}

/**
 * Asks a new user one question per screen. Every answer stays in this
 * component's state until Open my Budget, so leaving saves no records. Only the
 * chosen folder is remembered at once, and choosing again replaces it.
 */
export function FirstRun({
  keepInFolder,
}: {
  /** Keeps the Budget in the folder chosen. Absent where the browser has no folder picker. */
  keepInFolder:
    | ((folder: FileSystemDirectoryHandle) => Promise<void>)
    | undefined;
}) {
  const writer = useChangeLogWriter();
  const [stepIndex, setStepIndex] = useState(0);
  const [currency, setCurrency] = useState(() =>
    guessCurrency(navigator.language),
  );
  const [categories, setCategories] = useState<CategoriesChoice>();
  const [accounts, setAccounts] = useState<readonly AddedAccount[]>([]);
  const [draft, setDraft] = useState(BLANK_DRAFT);
  const [adding, setAdding] = useState(true);

  const next = () => setStepIndex(stepIndex + 1);
  const steps = keepInFolder ? STEPS_WITH_FOLDER : STEPS;
  const step = steps[stepIndex];

  return (
    <main className={styles.page}>
      {stepIndex > 0 && (
        <div className={styles.progress}>
          <button
            type="button"
            className={styles.back}
            onClick={() => setStepIndex(stepIndex - 1)}
          >
            <span aria-hidden="true">‹ </span>Back
          </button>
          <span className={styles.note}>
            {stepIndex} of {steps.length - 1}
          </span>
        </div>
      )}
      {step === "welcome" && <Welcome onNext={next} />}
      {step === "folder" && keepInFolder && (
        <DataFolderStep
          onChoose={async (folder) => {
            await keepInFolder(folder);
            next();
          }}
        />
      )}
      {step === "currency" && (
        <CurrencyStep value={currency} onChange={setCurrency} onNext={next} />
      )}
      {step === "categories" && (
        <CategoriesStep
          value={categories}
          onChoose={(choice) => {
            setCategories(choice);
            next();
          }}
        />
      )}
      {step === "accounts" && categories && (
        <AccountsStep
          currency={currency}
          accounts={accounts}
          onAccountsChange={setAccounts}
          draft={draft}
          onDraftChange={setDraft}
          adding={adding}
          onAddingChange={setAdding}
          onOpen={(openingBalances) =>
            openMyBudget(writer, {
              currency,
              categories,
              accounts: openingBalances,
            })
          }
        />
      )}
    </main>
  );
}

/** The step's question. Takes focus when the step appears, so a screen reader follows along. */
function Title({
  children,
  titleRef,
}: {
  children: ReactNode;
  titleRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const ownRef = useRef<HTMLHeadingElement>(null);
  const ref = titleRef ?? ownRef;
  useEffect(() => ref.current?.focus(), [ref]);
  return (
    <h1 ref={ref} tabIndex={-1} className={styles.title}>
      {children}
    </h1>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <p className={styles.brand}>Crownkeep</p>
      <Title>Give every dollar a job.</Title>
      <p className={styles.lead}>
        Tell Crownkeep what's in your Accounts, then decide what each dollar is
        for. When you spend, you'll see what's left for that job.
      </p>
      {!hasFolderPicker() && (
        <p className={styles.note}>
          Your Budget stays in this browser, on this device. Clearing this
          browser's data erases it. This browser can't keep your Budget in a
          folder, so it can't sync to your other devices.
        </p>
      )}
      {shouldSuggestHomeScreen() && (
        <p className={styles.note}>
          Adding Crownkeep to your Home Screen gives your Budget its best chance
          of lasting on this iPhone.
        </p>
      )}
      <button type="button" className={styles.primary} onClick={onNext}>
        Get started
      </button>
    </>
  );
}

/** Can't be skipped: the only way on is choosing a folder, and cancelling stays here. */
function DataFolderStep({
  onChoose,
}: {
  onChoose: (folder: FileSystemDirectoryHandle) => Promise<void>;
}) {
  async function choose() {
    try {
      const folder = await window.showDirectoryPicker?.({
        id: "crownkeep",
        mode: "readwrite",
      });
      if (folder) await onChoose(folder);
    } catch (error) {
      // Cancelling, and declining the browser's prompt, both arrive as AbortError.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Crownkeep could not use that folder", error);
      }
    }
  }

  return (
    <>
      <Title>Where should your Budget live?</Title>
      <p className={styles.lead}>
        Crownkeep keeps everything in that folder, and nothing goes to us.
      </p>
      <p className={styles.note}>
        Pick a folder a sync service already watches to reach other devices, or
        the same folder as another device to open that Budget.
      </p>
      <p className={styles.note}>
        You can move this folder later. Crownkeep will ask you to find it again.
      </p>
      <p className={styles.note}>
        Setting up a second device? Wait until your sync service has finished,
        then pick the folder.
      </p>
      <p className={styles.note}>Choose Allow when your browser asks.</p>
      <button type="button" className={styles.primary} onClick={choose}>
        Choose a folder
      </button>
    </>
  );
}

function CurrencyStep({
  value,
  onChange,
  onNext,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  onNext: () => void;
}) {
  const names = new Intl.DisplayNames(undefined, { type: "currency" });
  return (
    <>
      <Title>What currency is your Budget in?</Title>
      <p className={styles.lead}>
        A Budget has one currency, and you can't change it later.
      </p>
      <label className={styles.field}>
        Currency
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {currencies().map((code) => (
            <option key={code} value={code}>
              {code}, {names.of(code)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={styles.primary} onClick={onNext}>
        Next
      </button>
    </>
  );
}

function CategoriesStep({
  value,
  onChoose,
}: {
  value: CategoriesChoice | undefined;
  onChoose: (choice: CategoriesChoice) => void;
}) {
  const starterNames = starterSet.flatMap(([, names]) => names).join(", ");
  return (
    <>
      <Title>Start with some Categories?</Title>
      <p className={styles.lead}>
        A Category is a job for your money, like Rent or Groceries. You can
        rename, hide or add to these any time.
      </p>
      <Choice
        title="Use the starter set"
        detail={starterNames}
        pressed={value === "starter"}
        onClick={() => onChoose("starter")}
      />
      <Choice
        title="Start blank"
        detail="You'll add your own on the Budget screen."
        pressed={value === "blank"}
        onClick={() => onChoose("blank")}
      />
    </>
  );
}

function Choice({
  title,
  detail,
  pressed,
  onClick,
}: {
  title: string;
  detail: string;
  pressed: boolean;
  onClick: () => void;
}) {
  const detailId = useId();
  return (
    <button
      type="button"
      aria-label={title}
      aria-describedby={detailId}
      aria-pressed={pressed}
      className={styles.choice}
      onClick={onClick}
    >
      <b>{title}</b>
      <span id={detailId} className={styles.note}>
        {detail}
      </span>
    </button>
  );
}

function AccountsStep({
  currency,
  accounts,
  onAccountsChange,
  draft,
  onDraftChange,
  adding,
  onAddingChange,
  onOpen,
}: {
  currency: Currency;
  accounts: readonly AddedAccount[];
  onAccountsChange: (accounts: readonly AddedAccount[]) => void;
  draft: AccountDraft;
  onDraftChange: (draft: AccountDraft) => void;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  onOpen: (
    accounts: readonly {
      name: string;
      kind: AccountKind;
      openingBalance: Money;
    }[],
  ) => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The button just pressed is about to go, so keep focus somewhere sensible.
  const focusTitle = () => titleRef.current?.focus();

  const read = accounts.map((account) => ({
    ...account,
    openingBalance: readAmount(account.holds, currency),
  }));
  const readable = read.flatMap(({ openingBalance, ...account }) =>
    openingBalance ? [{ ...account, openingBalance }] : [],
  );
  const total = readable.reduce(
    (sum, { openingBalance }) => addMoney(sum, openingBalance),
    money(0, currency),
  );

  return (
    <>
      <Title titleRef={titleRef}>Where's your money now?</Title>
      <p className={styles.lead}>
        Add each place you keep money you could spend soon: checking, savings or
        cash. You can add more later.
      </p>
      {read.length > 0 && (
        <ul className={styles.accounts}>
          {read.map(({ id, name, kind, holds, openingBalance }) => (
            <li key={id} className={styles.account}>
              <span className={styles.accountName}>
                {name}
                <span className={styles.note}>
                  {KINDS.find((option) => option.kind === kind)?.label}
                </span>
                {!openingBalance && (
                  <span role="alert">
                    "{holds}" isn't an amount in {currency}. Remove it and add
                    it again.
                  </span>
                )}
              </span>
              {openingBalance && <span>{formatMoney(openingBalance)}</span>}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  const rest = accounts.filter((other) => other.id !== id);
                  onAccountsChange(rest);
                  if (rest.length === 0) onAddingChange(true);
                  focusTitle();
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <AddAccountForm
          currency={currency}
          draft={draft}
          onDraftChange={onDraftChange}
          takeFocus={accounts.length > 0}
          onAdd={() => {
            onAccountsChange([
              ...accounts,
              { ...draft, name: draft.name.trim(), id: crypto.randomUUID() },
            ]);
            onDraftChange(BLANK_DRAFT);
            onAddingChange(false);
            focusTitle();
          }}
          onCancel={
            accounts.length > 0
              ? () => {
                  onDraftChange(BLANK_DRAFT);
                  onAddingChange(false);
                  focusTitle();
                }
              : undefined
          }
        />
      ) : (
        <>
          <p className={styles.note}>
            {formatMoney(total)} goes to Ready to Assign, for you to give every
            dollar a job.
          </p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => onAddingChange(true)}
          >
            Add another Account
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={readable.length < accounts.length}
            onClick={() => onOpen(readable)}
          >
            Open my Budget
          </button>
        </>
      )}
    </>
  );
}

function AddAccountForm({
  currency,
  draft,
  onDraftChange,
  takeFocus,
  onAdd,
  onCancel,
}: {
  currency: Currency;
  draft: AccountDraft;
  onDraftChange: (draft: AccountDraft) => void;
  takeFocus: boolean;
  onAdd: () => void;
  onCancel: (() => void) | undefined;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [takeFocusOnce] = useState(takeFocus);

  useEffect(() => {
    if (takeFocusOnce) nameRef.current?.focus();
  }, [takeFocusOnce]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("An Account needs a name");
    } else if (!readAmount(draft.holds, currency)) {
      setError(`"${draft.holds}" isn't an amount in ${currency}`);
    } else {
      setError(undefined);
      onAdd();
    }
  }

  return (
    <form aria-label="Add an Account" className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        Name
        <input
          ref={nameRef}
          required
          value={draft.name}
          onChange={(event) =>
            onDraftChange({ ...draft, name: event.target.value })
          }
        />
      </label>
      <fieldset className={styles.kinds}>
        <legend>Kind</legend>
        {KINDS.map(({ kind, label }) => (
          <label key={kind} className={styles.kind}>
            <input
              type="radio"
              name="kind"
              checked={draft.kind === kind}
              onChange={() => onDraftChange({ ...draft, kind })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className={styles.field}>
        What it holds today
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={draft.holds}
          onChange={(event) =>
            onDraftChange({ ...draft, holds: event.target.value })
          }
        />
      </label>
      <p className={styles.note}>
        This is its Opening Balance. It goes to Ready to Assign, for you to give
        every dollar a job.
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className={styles.submit}>
        Add Account
      </button>
      {onCancel && (
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}
