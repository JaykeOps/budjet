import { type FormEvent, useId, useState } from "react";
import {
  type Currency,
  formatMoney,
  money,
  parseMoney,
} from "../../kernel/money";
import { type Account, useAccounts } from "../accounts";
import { type CategoryGroup, useCategoryGroups } from "../categories";
import type { TransactionInput } from "./commands";
import { useAccountTransactions } from "./hooks";

/**
 * An Account's Transactions, newest first, and a form to record another in
 * it. The app shell decides what recording does; an error it throws is shown
 * on the form.
 */
export function TransactionsScreen({
  currency,
  onRecord,
}: {
  currency: Currency;
  onRecord: (input: TransactionInput) => void;
}) {
  const headingId = useId();
  const accounts = useAccounts().filter(({ closed }) => !closed);
  const [selectedId, setSelectedId] = useState<string>();
  const account =
    accounts.find(({ id }) => id === selectedId) ?? accounts.at(0);
  if (!account) return null;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Transactions</h2>
      <label>
        Account{" "}
        <select
          value={account.id}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {accounts.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <RecordTransactionForm
        accountId={account.id}
        currency={currency}
        onRecord={onRecord}
      />
      <TransactionList account={account} />
    </section>
  );
}

type Direction = "out" | "in";

function RecordTransactionForm({
  accountId,
  currency,
  onRecord,
}: {
  accountId: string;
  currency: Currency;
  onRecord: (input: TransactionInput) => void;
}) {
  const headingId = useId();
  const categoryFieldId = useId();
  const groups = useCategoryGroups();
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState<Direction>("out");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [payee, setPayee] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const typed = parseMoney(amount, currency);
    if (!typed || typed.minorUnits < 0) {
      setError(`"${amount}" isn't an amount in ${currency}`);
      return;
    }
    const sign = direction === "out" ? -1 : 1;
    try {
      onRecord({
        accountId,
        date,
        amount: money(sign * typed.minorUnits, currency),
        categoryId: categoryId || undefined,
        payee,
        memo,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setError(undefined);
    setDirection("out");
    setAmount("");
    setCategoryId("");
    setPayee("");
    setMemo("");
  }

  return (
    <form aria-labelledby={headingId} onSubmit={submit}>
      <h3 id={headingId}>Record a Transaction</h3>
      <label>
        Date{" "}
        <input
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>{" "}
      <label>
        Money{" "}
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value as Direction)}
        >
          <option value="out">Going out</option>
          <option value="in">Coming in</option>
        </select>
      </label>{" "}
      <label>
        Amount ({currency}){" "}
        <input
          required
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>{" "}
      <label htmlFor={categoryFieldId}>Category</label>{" "}
      <CategoryPicker
        id={categoryFieldId}
        groups={groups}
        value={categoryId}
        onChange={setCategoryId}
      />{" "}
      <label>
        Payee{" "}
        <input
          value={payee}
          onChange={(event) => setPayee(event.target.value)}
        />
      </label>{" "}
      <label>
        Memo{" "}
        <input value={memo} onChange={(event) => setMemo(event.target.value)} />
      </label>{" "}
      <button type="submit">Record Transaction</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

/** Every Category still in use, under its Category Group. No Category means Ready to Assign. */
function CategoryPicker({
  id,
  groups,
  value,
  onChange,
}: {
  id: string;
  groups: CategoryGroup[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">None: Ready to Assign</option>
      {groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.categories
            .filter(({ hidden }) => !hidden)
            .map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

function TransactionList({ account }: { account: Account }) {
  const headingId = useId();
  const transactions = useAccountTransactions(account.id);
  const groups = useCategoryGroups();
  const categoryNames = new Map(
    groups.flatMap(({ categories }) =>
      categories.map(({ id, name }) => [id, name]),
    ),
  );

  return (
    <>
      <h3 id={headingId}>Transactions in {account.name}</h3>
      <table aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Payee</th>
            <th scope="col">Category</th>
            <th scope="col">Memo</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>{transaction.date}</td>
              <td>{transaction.payee}</td>
              <td>
                {transaction.categoryId
                  ? categoryNames.get(transaction.categoryId)
                  : "Ready to Assign"}
              </td>
              <td>{transaction.memo}</td>
              <td>{formatMoney(transaction.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** This device's local date, "YYYY-MM-DD". */
function today(): string {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
