import type { RefObject } from "react";
import {
  type Currency,
  formatMoney,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import type { Account } from "../accounts";
import type { TransferInput } from "./commands";
import styles from "./Transfer.module.css";
import type { TransferDraft } from "./TransferSheet";

/** A Transfer part way through being entered in the row. */
export type TransferRowDraft = {
  /** The amount as typed. */
  typed: string;
  fromAccountId: string;
  toAccountId: string;
  date: string;
};

const firstOther = (accounts: readonly Account[], id?: string) =>
  accounts.find((account) => account.id !== id)?.id ?? "";

/** What the row starts with, choosing whatever `draft` leaves out. */
export function transferRowDraft(
  draft: TransferDraft,
  accounts: readonly Account[],
  today: string,
): TransferRowDraft {
  const fromAccountId =
    draft.fromAccountId ?? firstOther(accounts, draft.toAccountId);
  return {
    typed: draft.amount ? typedMoney(draft.amount) : "",
    fromAccountId,
    toAccountId: draft.toAccountId ?? firstOther(accounts, fromAccountId),
    date: draft.date ?? today,
  };
}

/** The Transfer to make, once it has an amount and somewhere to go. */
export function transferRowInput(
  { typed, fromAccountId, toAccountId, date }: TransferRowDraft,
  currency: Currency,
): TransferInput | undefined {
  const amount = parseMoney(typed, currency);
  if (!amount || amount.minorUnits <= 0 || !toAccountId) return undefined;
  return { fromAccountId, toAccountId, date, amount };
}

/** Amount, From, To and Date, for the row that records on desktop. */
export function TransferRowFields({
  draft,
  accounts,
  amountField,
  onChange,
}: {
  draft: TransferRowDraft;
  accounts: readonly Account[];
  amountField: RefObject<HTMLInputElement | null>;
  onChange: (draft: TransferRowDraft) => void;
}) {
  const option = ({ id, name, balance }: Account) => (
    <option key={id} value={id}>
      {name} · {formatMoney(balance)}
    </option>
  );
  return (
    <>
      <label className={styles.rowField}>
        Amount
        <input
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
        />
      </label>
      <label className={styles.rowField}>
        From
        <select
          value={draft.fromAccountId}
          onChange={({ target: { value } }) =>
            onChange({
              ...draft,
              fromAccountId: value,
              toAccountId:
                value === draft.toAccountId
                  ? firstOther(accounts, value)
                  : draft.toAccountId,
            })
          }
        >
          {accounts.map(option)}
        </select>
      </label>
      <label className={styles.rowField}>
        To
        <select
          value={draft.toAccountId}
          onChange={(event) =>
            onChange({ ...draft, toAccountId: event.target.value })
          }
        >
          {accounts.filter(({ id }) => id !== draft.fromAccountId).map(option)}
        </select>
      </label>
      <label className={styles.rowField}>
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
    </>
  );
}

/** What the Transfer in the row does. */
export function TransferRowLine({
  draft,
  accounts,
  currency,
}: {
  draft: TransferRowDraft;
  accounts: readonly Account[];
  currency: Currency;
}) {
  const from = accounts.find(({ id }) => id === draft.fromAccountId);
  const to = accounts.find(({ id }) => id === draft.toAccountId);
  if (!to || !from) return <>There's no other Account to move money to yet.</>;
  const moved = parseMoney(draft.typed, currency)?.minorUnits ?? 0;
  const after = (balance: number, change: number) =>
    formatMoney(money(balance + change, currency));
  return (
    <>
      {from.name} goes to {after(from.balance.minorUnits, -moved)}, {to.name} to{" "}
      {after(to.balance.minorUnits, moved)}. Categories and Ready to Assign
      don't change.
    </>
  );
}
