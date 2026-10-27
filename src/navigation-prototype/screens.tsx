// PROTOTYPE (prototype/navigation): throwaway. Today's screens wired to the
// in-memory Budget, plus the two pieces no screen has yet (an Account list to
// navigate by, and Activity across every Account). Every variant arranges
// these same pieces; only the navigation differs.
import { type ReactNode, useState } from "react";
import type { ChangeRecord } from "../kernel/change-log";
import { formatMoney, type Money } from "../kernel/money";
import {
  useChangeLogQuery,
  useChangeLogWriter,
} from "../kernel/use-change-log-query";
import { useMonthInUrl } from "../month-in-url";
import { AccountsScreen, accounts } from "../slices/accounts";
import {
  closeAccount,
  openAccount,
  redeclareBalance,
  renameAccount,
} from "../slices/accounts/commands";
import {
  copyLastMonth,
  moveMoney,
  setAssignment,
} from "../slices/assignments/commands";
import { useBudget } from "../slices/budget-setup";
import { CategoryList, categoryGroups } from "../slices/categories";
import { MonthBudget } from "../slices/month-budget-view";
import {
  accountTransactionList,
  type TransactionListEntry,
  TransactionsScreen,
} from "../slices/transactions";
import {
  deleteTransaction,
  editTransaction,
  recordTransaction,
} from "../slices/transactions/commands";
import { TransfersScreen } from "../slices/transfers";
import {
  deleteTransfer,
  editTransfer,
  makeTransfer,
} from "../slices/transfers/commands";

function useCurrency() {
  const budget = useBudget();
  if (!budget) throw new Error("The prototype needs the demo Budget");
  return budget;
}

export function BudgetPage({ withCategories = true }) {
  const writer = useChangeLogWriter();
  const { firstMonth, currency } = useCurrency();
  const [month, setMonth] = useMonthInUrl(firstMonth);
  return (
    <>
      <MonthBudget
        month={month}
        firstMonth={firstMonth}
        currency={currency}
        onMonthChange={setMonth}
        onAssign={(input) => setAssignment(writer, input)}
        onCopyLastMonth={(of) =>
          copyLastMonth(writer, { month: of, skipping: [] })
        }
        onMoveMoney={(input) => moveMoney(writer, input)}
      />
      {withCategories && (
        <details>
          <summary>Manage Categories</summary>
          <CategoryList />
        </details>
      )}
    </>
  );
}

/** One Account's history, with recording, editing and deleting. */
export function Register({
  accountId,
  onSelectAccount,
}: {
  accountId?: string;
  onSelectAccount: (id: string) => void;
}) {
  const writer = useChangeLogWriter();
  const { currency } = useCurrency();
  return (
    <TransactionsScreen
      currency={currency}
      selectedAccountId={accountId}
      onSelectAccount={onSelectAccount}
      onRecord={(input) => recordTransaction(writer, input)}
      onEdit={(id, input) => editTransaction(writer, id, input)}
      onDelete={(id) => deleteTransaction(writer, id)}
    />
  );
}

/** Open, re-declare, rename and close Accounts. */
export function ManageAccounts() {
  const writer = useChangeLogWriter();
  const { currency } = useCurrency();
  return (
    <AccountsScreen
      currency={currency}
      onOpenAccount={(input) => openAccount(writer, input)}
      onRedeclareBalance={(accountId, balance) =>
        redeclareBalance(writer, accountId, { balance })
      }
      onRename={(accountId, name) => renameAccount(writer, accountId, { name })}
      onClose={(accountId) => closeAccount(writer, accountId)}
    />
  );
}

export function Transfers() {
  const writer = useChangeLogWriter();
  const { currency } = useCurrency();
  return (
    <TransfersScreen
      currency={currency}
      onMake={(input) => makeTransfer(writer, input)}
      onEdit={(id, input) => editTransfer(writer, id, input)}
      onDelete={(id) => deleteTransfer(writer, id)}
    />
  );
}

/** What the (+) opens: recording a Transaction, or making a Transfer. */
export function RecordChooser() {
  const [what, setWhat] = useState<"transaction" | "transfer">("transaction");
  const [accountId, setAccountId] = useState<string>();
  return (
    <>
      <div className="p-segmented" role="group" aria-label="Record">
        <button
          type="button"
          aria-pressed={what === "transaction"}
          onClick={() => setWhat("transaction")}
        >
          Spending or income
        </button>
        <button
          type="button"
          aria-pressed={what === "transfer"}
          onClick={() => setWhat("transfer")}
        >
          Transfer
        </button>
      </div>
      <p className="p-note">
        Placeholder: the recording flow itself is “How does the user record a
        Transaction on a phone?”. This only shows where (+) leads.
      </p>
      {what === "transaction" ? (
        <Register accountId={accountId} onSelectAccount={setAccountId} />
      ) : (
        <Transfers />
      )}
    </>
  );
}

export function AccountList({
  selected,
  onSelect,
  withAll = false,
}: {
  selected?: string;
  onSelect: (id: string) => void;
  withAll?: boolean;
}) {
  const all = useChangeLogQuery(accounts).filter(({ closed }) => !closed);
  return (
    <ul className="p-accounts">
      {withAll && (
        <li>
          <button
            type="button"
            aria-current={selected === "all" || undefined}
            onClick={() => onSelect("all")}
          >
            <span>All Accounts</span>
            <small>Activity</small>
          </button>
        </li>
      )}
      {all.map(({ id, name, kind, balance }) => (
        <li key={id}>
          <button
            type="button"
            aria-current={selected === id || undefined}
            onClick={() => onSelect(id)}
          >
            <span>
              {name}
              <small> {kind}</small>
            </span>
            <Amount value={balance} />
          </button>
        </li>
      ))}
    </ul>
  );
}

type ActivityRow = {
  key: string;
  date: string;
  title: string;
  detail: string;
  amount: Money;
};

/** Every Account's history in one list; a Transfer shows once, from its source. */
function activity(records: readonly ChangeRecord[]): ActivityRow[] {
  const categoryName = new Map(
    categoryGroups(records)
      .flatMap((group) => group.categories)
      .map(({ id, name }) => [id, name]),
  );
  const all = accounts(records);
  const accountName = new Map(all.map(({ id, name }) => [id, name]));
  return all
    .flatMap(({ id: accountId, name }) =>
      accountTransactionList(records, accountId)
        .filter(
          (entry) => entry.kind !== "transfer" || entry.amount.minorUnits < 0,
        )
        .map((entry) => row(entry, name)),
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  function row(entry: TransactionListEntry, account: string): ActivityRow {
    const base = { key: entry.id, date: entry.date, amount: entry.amount };
    if (entry.kind === "transfer") {
      const to = accountName.get(entry.otherAccountId);
      return { ...base, title: `Transfer to ${to}`, detail: account };
    }
    if (entry.kind === "adjustment") {
      return { ...base, title: "Balance re-declared", detail: account };
    }
    const category = entry.categoryId
      ? categoryName.get(entry.categoryId)
      : "Ready to Assign";
    return {
      ...base,
      title: entry.payee ?? "No payee",
      detail: `${category} · ${account}`,
    };
  }
}

export function Activity() {
  const rows = useChangeLogQuery(activity);
  const byDate = Map.groupBy(rows, ({ date }) => date);
  return (
    <section aria-label="Activity" className="p-activity">
      {[...byDate].map(([date, entries]) => (
        <div key={date}>
          <h3>{date}</h3>
          <ul>
            {entries.map(({ key, title, detail, amount }) => (
              <li key={key}>
                <span>
                  {title}
                  <small>{detail}</small>
                </span>
                <Amount value={amount} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function Amount({ value }: { value: Money }) {
  return (
    <span className={value.minorUnits < 0 ? "p-amount p-out" : "p-amount"}>
      {formatMoney(value)}
    </span>
  );
}

/** A bottom sheet on a phone, a side panel on a desktop. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="p-scrim" onClick={onClose} onKeyDown={() => {}}>
      <div
        className="p-sheet"
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
