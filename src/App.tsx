import { type ComponentProps, useEffect } from "react";
import { FirstRun } from "./first-run/FirstRun";
import type { ChangeLogWriter } from "./kernel/change-log";
import {
  ChangeLogWriterProvider,
  useChangeLogWriter,
} from "./kernel/use-change-log-query";
import { useMonthInUrl } from "./month-in-url";
import { requestPersistentStorage } from "./persistent-storage";
import {
  AccountsScreen,
  OpenAccountForm,
  useAccounts,
} from "./slices/accounts";
import {
  closeAccount,
  openAccount,
  redeclareBalance,
  renameAccount,
} from "./slices/accounts/commands";
import {
  copyLastMonth,
  moveMoney,
  setAssignment,
} from "./slices/assignments/commands";
import { type Budget, useBudget } from "./slices/budget-setup";
import { CategoryList, categoryGroups } from "./slices/categories";
import { MonthBudget } from "./slices/month-budget-view";
import { TransactionsScreen } from "./slices/transactions";
import {
  deleteTransaction,
  editTransaction,
  recordTransaction,
} from "./slices/transactions/commands";
import { TransfersScreen } from "./slices/transfers";
import {
  deleteTransfer,
  editTransfer,
  makeTransfer,
} from "./slices/transfers/commands";
import { useUrlParameter } from "./url-parameter";

export function App({ writer }: { writer: ChangeLogWriter }) {
  return (
    <ChangeLogWriterProvider value={writer}>
      <Root />
    </ChangeLogWriterProvider>
  );
}

/** First run until there's a Budget, then the Budget. */
function Root() {
  const budget = useBudget();
  const hasBudget = budget !== undefined;

  // Asking once there's something to keep, because some browsers show a prompt.
  useEffect(() => {
    if (hasBudget) requestPersistentStorage();
  }, [hasBudget]);

  if (!budget) return <FirstRun />;
  return (
    <main>
      <h1>budjet</h1>
      <Shell budget={budget} />
      <p>Version {__APP_VERSION__}</p>
    </main>
  );
}

/**
 * Shows the Budget. A Budget with no Account yet can only come from an older
 * setup, or a page closed while first run was writing, so it asks for one.
 */
function Shell({ budget }: { budget: Budget }) {
  const writer = useChangeLogWriter();
  const accounts = useAccounts();

  if (accounts.length === 0) {
    return (
      <OpenAccountForm
        heading="Add your first Account"
        currency={budget.currency}
        onOpen={(input) => openAccount(writer, input)}
      />
    );
  }
  return (
    <>
      <BudgetMonth
        firstMonth={budget.firstMonth}
        currency={budget.currency}
        onAssign={(input) => setAssignment(writer, input)}
        onCopyLastMonth={(month) =>
          copyLastMonth(writer, { month, skipping: hiddenCategoryIds(writer) })
        }
        onMoveMoney={(input) => moveMoney(writer, input)}
      />
      <section aria-labelledby="budget-heading">
        <h2 id="budget-heading">Budget</h2>
        <p>Kept in {budget.currency}.</p>
        <CategoryList />
      </section>
      <AccountsScreen
        currency={budget.currency}
        onOpenAccount={(input) => openAccount(writer, input)}
        onRedeclareBalance={(accountId, balance) =>
          redeclareBalance(writer, accountId, { balance })
        }
        onRename={(accountId, name) =>
          renameAccount(writer, accountId, { name })
        }
        onClose={(accountId) => closeAccount(writer, accountId)}
      />
      <AccountTransactions
        currency={budget.currency}
        onRecord={(input) => recordTransaction(writer, input)}
        onEdit={(id, input) => editTransaction(writer, id, input)}
        onDelete={(id) => deleteTransaction(writer, id)}
      />
      <TransfersScreen
        currency={budget.currency}
        onMake={(input) => makeTransfer(writer, input)}
        onEdit={(id, input) => editTransfer(writer, id, input)}
        onDelete={(id) => deleteTransfer(writer, id)}
      />
    </>
  );
}

/** The Transactions screen for the Account in the address bar (`?account=<id>`). */
function AccountTransactions(
  props: Omit<
    ComponentProps<typeof TransactionsScreen>,
    "selectedAccountId" | "onSelectAccount"
  >,
) {
  const [accountId, setAccountId] = useUrlParameter("account");
  return (
    <TransactionsScreen
      selectedAccountId={accountId ?? undefined}
      onSelectAccount={(id) => setAccountId(id, "push")}
      {...props}
    />
  );
}

/** Copy last Month leaves hidden Categories out. */
function hiddenCategoryIds(writer: ChangeLogWriter): string[] {
  return categoryGroups(writer.changeLog.readAll())
    .flatMap((group) => group.categories)
    .filter(({ hidden }) => hidden)
    .map(({ id }) => id);
}

/** The Month Budget view for the Month in the address bar. */
function BudgetMonth({
  firstMonth,
  ...props
}: Omit<ComponentProps<typeof MonthBudget>, "month" | "onMonthChange">) {
  const [month, setMonth] = useMonthInUrl(firstMonth);
  return (
    <MonthBudget
      month={month}
      firstMonth={firstMonth}
      onMonthChange={setMonth}
      {...props}
    />
  );
}
