import type { ComponentProps } from "react";
import type { ChangeLogWriter } from "./kernel/change-log";
import {
  ChangeLogWriterProvider,
  useChangeLogWriter,
} from "./kernel/use-change-log-query";
import { useMonthInUrl } from "./month-in-url";
import {
  AccountsScreen,
  OpenAccountForm,
  useAccounts,
} from "./slices/accounts";
import { openAccount } from "./slices/accounts/commands";
import {
  copyLastMonth,
  moveMoney,
  setAssignment,
} from "./slices/assignments/commands";
import { BudgetSetupForm, useBudget } from "./slices/budget-setup";
import { createBudget } from "./slices/budget-setup/commands";
import { CategoryList } from "./slices/categories";
import { addStarterSet } from "./slices/categories/commands";
import { MonthBudget } from "./slices/month-budget-view";
import { TransactionsScreen } from "./slices/transactions";
import { recordTransaction } from "./slices/transactions/commands";

export function App({ writer }: { writer: ChangeLogWriter }) {
  return (
    <ChangeLogWriterProvider value={writer}>
      <main>
        <h1>budjet</h1>
        <Shell />
        <p>Version {__APP_VERSION__}</p>
      </main>
    </ChangeLogWriterProvider>
  );
}

/**
 * Walks a new user through setup (the Budget, then its first Account), then
 * shows the Budget.
 */
function Shell() {
  const writer = useChangeLogWriter();
  const budget = useBudget();
  const accounts = useAccounts();

  if (!budget) {
    return (
      <BudgetSetupForm
        onCreate={({ currency }) => {
          createBudget(writer, { currency });
          addStarterSet(writer);
        }}
      />
    );
  }
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
        onCopyLastMonth={(month) => copyLastMonth(writer, { month })}
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
      />
      <TransactionsScreen
        currency={budget.currency}
        onRecord={(input) => recordTransaction(writer, input)}
      />
    </>
  );
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
