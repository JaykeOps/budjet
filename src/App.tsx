import type { Writer } from "./kernel/change-log";
import { useWriter, WriterProvider } from "./kernel/use-change-log-query";
import { BudgetSetupForm, useBudget } from "./slices/budget-setup";
import { createBudget } from "./slices/budget-setup/commands";

export function App({ writer }: { writer: Writer }) {
  return (
    <WriterProvider value={writer}>
      <main>
        <h1>budjet</h1>
        <Shell />
        <p>Version {__APP_VERSION__}</p>
      </main>
    </WriterProvider>
  );
}

/** Shows the setup flow until a Budget exists, then the Budget. */
function Shell() {
  const writer = useWriter();
  const budget = useBudget();

  if (!budget) {
    return (
      <BudgetSetupForm
        onCreate={({ currency }) => createBudget(writer, { currency })}
      />
    );
  }
  return (
    <section aria-labelledby="budget-heading">
      <h2 id="budget-heading">Budget</h2>
      <p>Kept in {budget.currency}. It has no Accounts or Categories yet.</p>
    </section>
  );
}
