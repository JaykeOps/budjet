import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { type Currency, money, parseMoney } from "../../kernel/money";
import { useToast } from "../../ui/Toast";
import { useAccounts } from "../accounts";
import {
  type TransferInput,
  TransferRowFields,
  TransferRowLine,
  transferRowDraft,
  transferRowInput,
} from "../transfers";
import type { TransactionInput } from "./commands";
import { Details, sheetTitle } from "./EntrySheet";
import styles from "./History.module.css";
import type {
  Transaction,
  TransactionListEntry,
  TransferEntry,
} from "./queries";
import { AfterLine, TransactionFields } from "./RecordRow";
import rowStyles from "./RecordRow.module.css";
import {
  type Draft,
  draftAmount,
  draftChanged,
  draftOf,
  missingField,
} from "./record-flow";

/** What the app shell does with a row's changes. */
type RowActions = {
  onEdit: (id: string, input: TransactionInput) => void;
  onDelete: (id: string) => void;
  onEditTransfer: (id: string, input: TransferInput) => void;
  onDeleteTransfer: (id: string) => void;
  onDeleteRedeclared: (entry: TransactionListEntry) => void;
};

type Close = (returnFocus: boolean) => void;

/**
 * A history's row on desktop once tapped, open where it sits: a Transaction or
 * Transfer to edit, or a row that only reads, by the same rules as a phone's sheet.
 */
export function InPlaceRow({
  entry,
  currency,
  closedAccountName,
  close,
  ...actions
}: RowActions & {
  entry: TransactionListEntry;
  currency: Currency;
  closedAccountName?: string;
  close: Close;
}) {
  if (!closedAccountName && entry.kind === "transaction") {
    return (
      <EditTransaction
        transaction={entry}
        currency={currency}
        close={close}
        {...actions}
      />
    );
  }
  if (!closedAccountName && entry.kind === "transfer") {
    return (
      <EditTransfer
        transfer={entry}
        currency={currency}
        close={close}
        {...actions}
      />
    );
  }
  return (
    <ReadOnlyRow
      entry={entry}
      closedAccountName={closedAccountName}
      close={close}
      onDelete={actions.onDeleteRedeclared}
    />
  );
}

function EditTransaction({
  transaction,
  currency,
  close,
  onEdit,
  onDelete,
}: RowActions & {
  transaction: Transaction;
  currency: Currency;
  close: Close;
}) {
  // As it was on opening: saving another row mustn't change what this one started from.
  const [editing] = useState(transaction);
  const [started] = useState(() => draftOf(editing));
  const [draft, setDraft] = useState<Draft>(started);
  const payeeField = useRef<HTMLInputElement>(null);
  const categoryField = useRef<HTMLInputElement>(null);
  const amountField = useRef<HTMLInputElement>(null);
  return (
    <EditingRow
      label="Edit Transaction"
      close={close}
      firstField={payeeField}
      state={() => {
        const amount = draftAmount(draft, currency);
        const { accountId, date, categoryId, payee, memo } = draft;
        return {
          changed: draftChanged(draft, started, currency),
          save:
            !missingField(draft, currency) && amount
              ? () =>
                  onEdit(editing.id, {
                    accountId,
                    date,
                    amount,
                    categoryId,
                    payee,
                    memo,
                  })
              : undefined,
          focusMissing: () =>
            (missingField(draft, currency) === "category"
              ? categoryField
              : amountField
            ).current?.focus(),
        };
      }}
      onDelete={() => onDelete(editing.id)}
      line={<AfterLine draft={draft} editing={editing} currency={currency} />}
    >
      <TransactionFields
        draft={draft}
        editing={editing}
        currency={currency}
        payeeField={payeeField}
        categoryField={categoryField}
        amountField={amountField}
        onChange={setDraft}
      />
    </EditingRow>
  );
}

function EditTransfer({
  transfer,
  currency,
  close,
  onEditTransfer,
  onDeleteTransfer,
}: RowActions & {
  transfer: TransferEntry;
  currency: Currency;
  close: Close;
}) {
  const [editing] = useState(transfer);
  const open = useAccounts().filter(({ closed }) => !closed);
  // What each Account holds with this Transfer's own money left out.
  const accounts = open.map((account) => {
    const change =
      (account.id === editing.fromAccountId ? editing.amount.minorUnits : 0) -
      (account.id === editing.toAccountId ? editing.amount.minorUnits : 0);
    return {
      ...account,
      balance: money(account.balance.minorUnits + change, currency),
    };
  });
  const [moving, setMoving] = useState(() =>
    transferRowDraft(editing, open, editing.date),
  );
  const amountField = useRef<HTMLInputElement>(null);
  return (
    <EditingRow
      label="Edit Transfer"
      close={close}
      firstField={amountField}
      state={() => {
        const input = transferRowInput(moving, currency);
        const { memo } = editing;
        return {
          changed:
            parseMoney(moving.typed, currency)?.minorUnits !==
              editing.amount.minorUnits ||
            moving.fromAccountId !== editing.fromAccountId ||
            moving.toAccountId !== editing.toAccountId ||
            moving.date !== editing.date,
          save: input && (() => onEditTransfer(editing.id, { ...input, memo })),
          focusMissing: () => amountField.current?.focus(),
        };
      }}
      onDelete={() => onDeleteTransfer(editing.id)}
      line={
        <TransferRowLine
          draft={moving}
          accounts={accounts}
          currency={currency}
        />
      }
    >
      <TransferRowFields
        draft={moving}
        accounts={accounts}
        amountField={amountField}
        onChange={setMoving}
      />
    </EditingRow>
  );
}

/** What a row being edited says now. `save` is there only if it can be saved. */
type EditingState = {
  changed: boolean;
  save?: () => void;
  focusMissing: () => void;
};

/**
 * The row around a Transaction's or Transfer's fields. Enter or Save changes saves
 * and Esc or Cancel discards, each handing focus back. Leaving saves too, or if
 * that can't be done discards with a toast saying so, and focus stays where it went.
 */
function EditingRow({
  label,
  close,
  firstField,
  state,
  onDelete,
  line,
  children,
}: {
  label: string;
  close: Close;
  firstField: RefObject<HTMLInputElement | null>;
  state: () => EditingState;
  onDelete: () => void;
  line: ReactNode;
  children: ReactNode;
}) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string>();
  const finished = useRef(false);
  const finish = (returnFocus: boolean) => {
    finished.current = true;
    close(returnFocus);
  };

  function attempt(act: () => void) {
    try {
      act();
      finish(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  function leave() {
    if (finished.current) return;
    const { changed, save } = state();
    if (changed) {
      try {
        if (!save) throw new Error("Something's missing");
        save();
      } catch {
        toast({ text: "Changes discarded, as something was missing" });
      }
    }
    finish(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const { changed, save, focusMissing } = state();
    if (!changed) finish(true);
    else if (!save) focusMissing();
    else attempt(save);
  }

  function keys(event: KeyboardEvent<HTMLFormElement>) {
    // Enter in an input saves by itself, but not in a select.
    if (
      event.key === "Enter" &&
      (event.target as Element).tagName === "SELECT"
    ) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on opening.
  useEffect(() => {
    firstField.current?.focus();
    form.current?.scrollIntoView({ block: "nearest" });
  }, []);

  // Going away by other means than this row's own, such as back in the browser.
  const latest = useRef({ leave, state });
  latest.current = { leave, state };
  useEffect(
    () => () => {
      if (!finished.current && latest.current.state().changed) {
        latest.current.leave();
      }
    },
    [],
  );

  useLeaving(form, leave, () => finish(true));

  return (
    <form
      ref={form}
      aria-label={label}
      className={`${rowStyles.row} ${rowStyles.inList}`}
      onSubmit={submit}
      onKeyDownCapture={keys}
    >
      <div className={rowStyles.cells}>{children}</div>
      {error && <p role="alert">{error}</p>}
      <div className={rowStyles.foot}>
        <div className={rowStyles.line} aria-live="polite">
          {line}
        </div>
        <div className={rowStyles.buttons}>
          <button
            type="button"
            className={rowStyles.danger}
            onClick={() => attempt(onDelete)}
          >
            Delete
          </button>
          <button type="button" onClick={() => finish(true)}>
            Cancel
          </button>
          <button type="submit">
            Save changes{" "}
            <kbd aria-hidden className={rowStyles.key}>
              ↵
            </kbd>
          </button>
        </div>
      </div>
    </form>
  );
}

/** A row with nothing to edit, saying what it is. Esc, Close or leaving closes it. */
function ReadOnlyRow({
  entry,
  closedAccountName,
  close,
  onDelete,
}: {
  entry: TransactionListEntry;
  closedAccountName?: string;
  close: Close;
  onDelete: (entry: TransactionListEntry) => void;
}) {
  const title = sheetTitle(entry);
  const row = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    row.current?.scrollIntoView({ block: "nearest" });
  }, []);
  useLeaving(
    row,
    () => close(false),
    () => close(true),
  );
  return (
    <section
      ref={row}
      aria-label={title}
      className={`${rowStyles.row} ${rowStyles.inList} ${styles.reading}`}
    >
      <h4 className={styles.readingTitle}>{title}</h4>
      <Details
        entry={entry}
        closedAccountName={closedAccountName}
        onDelete={() => {
          onDelete(entry);
          close(true);
        }}
      />
      <div className={rowStyles.buttons}>
        <button ref={closeButton} type="button" onClick={() => close(true)}>
          Close
        </button>
      </div>
    </section>
  );
}

/**
 * Notices leaving a row: using something outside it, by pointer or by moving focus.
 * The toast doesn't count, so Undo stays for the row before, and nor does clicking
 * nothing in particular, which would otherwise lose work to a stray click.
 *
 * Leaving by pointer waits for the click: closing as it presses would move the
 * rows below, so that it lets go somewhere other than where it pressed.
 */
function useLeaving(
  within: RefObject<HTMLElement | null>,
  leave: () => void,
  cancel: () => void,
) {
  const latest = useRef({ leave, cancel });
  latest.current = { leave, cancel };
  // biome-ignore lint/correctness/useExhaustiveDependencies: `within` is a ref.
  useEffect(() => {
    let pressing = false;
    const isOutside = (target: EventTarget | null): target is Element =>
      target instanceof Element &&
      !within.current?.contains(target) &&
      !target.closest('[role="status"], [data-trigger="ComboBox"]');
    const press = () => {
      pressing = true;
    };
    const release = () => {
      pressing = false;
    };
    const click = ({ target }: MouseEvent) => {
      if (isOutside(target) && target.closest("a, button, input, select")) {
        latest.current.leave();
      }
    };
    const focus = ({ target }: FocusEvent) => {
      if (!pressing && isOutside(target)) latest.current.leave();
    };
    const key = ({ key, target }: globalThis.KeyboardEvent) => {
      if (key !== "Escape" || !(target instanceof Element)) return;
      // An open list of options takes the first Esc for itself.
      if (target.getAttribute("aria-expanded") === "true") return;
      // With focus nowhere after clicking on nothing in particular, it's still this row's.
      if (target === document.body || within.current?.contains(target)) {
        latest.current.cancel();
      }
    };
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("pointerup", release, true);
    document.addEventListener("click", click, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key, true);
    };
  }, []);
}
