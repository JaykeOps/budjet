import type { ChangeLogWriter } from "./kernel/change-log";
import {
  ChangeLogWriterProvider,
  useChangeLogWriter,
} from "./kernel/use-change-log-query";
import { BudgetSetupForm, useBudget } from "./slices/budget-setup";
import { createBudget } from "./slices/budget-setup/commands";
import { CategoryList } from "./slices/categories";
import { addStarterSet } from "./slices/categories/commands";

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

/** Shows the setup flow until a Budget exists, then the Budget. */
function Shell() {
  const writer = useChangeLogWriter();
  const budget = useBudget();

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
  return (
    <section aria-labelledby="budget-heading">
      <h2 id="budget-heading">Budget</h2>
      <p>Kept in {budget.currency}. It has no Accounts yet.</p>
      <CategoryList />
    </section>
  );
}
