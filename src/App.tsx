import { type ComponentProps, type ReactNode, useEffect } from "react";
import { FirstRun } from "./first-run/FirstRun";
import type { ChangeLogWriter } from "./kernel/change-log";
import { parseMonth } from "./kernel/month";
import {
  ChangeLogWriterProvider,
  useChangeLogWriter,
} from "./kernel/use-change-log-query";
import { useMonthInUrl } from "./month-in-url";
import { NavigationShell } from "./NavigationShell";
import { requestPersistentStorage } from "./persistent-storage";
import { placeAddress, usePlace } from "./place-in-url";
import {
  AccountsScreen,
  OpenAccountForm,
  useAccounts,
} from "./slices/accounts";
import {
  closeAccount,
  deleteRedeclaredBalance,
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
import { pushAddress, useUrlParameter } from "./url-parameter";

export function App({ writer }: { writer: ChangeLogWriter }) {
  return (
    <ChangeLogWriterProvider value={writer}>
      <Root />
    </ChangeLogWriterProvider>
  );
}

/** `titled` is false for a screen with its own top-level heading. */
function Page({
  titled = true,
  children,
}: {
  titled?: boolean;
  children: ReactNode;
}) {
  return (
    <main>
      {titled && <h1>budjet</h1>}
      {children}
      <p>Version {__APP_VERSION__}</p>
    </main>
  );
}

/** First run, which has no navigation, until there's a Budget, then the Budget. */
function Root() {
  const budget = useBudget();
  const hasBudget = budget !== undefined;

  // Asking once there's something to keep, because some browsers show a prompt.
  useEffect(() => {
    if (hasBudget) requestPersistentStorage();
  }, [hasBudget]);

  if (!budget) return <FirstRun />;
  return <Shell budget={budget} />;
}

/**
 * Shows the place the user is at, inside the navigation. A Budget with no
 * Account yet can only come from an older setup, or a page closed while first
 * run was writing, so it asks for one, without navigation.
 */
function Shell({ budget }: { budget: Budget }) {
  const writer = useChangeLogWriter();
  const accounts = useAccounts();
  const place = usePlace();

  if (accounts.length === 0) {
    return (
      <Page>
        <OpenAccountForm
          heading="Add your first Account"
          currency={budget.currency}
          onOpen={(input) => openAccount(writer, input)}
        />
      </Page>
    );
  }
  return (
    <NavigationShell>
      <Page titled={place !== "budget"}>
        {place === "budget" && (
          <>
            <BudgetMonth
              firstMonth={budget.firstMonth}
              currency={budget.currency}
              onAssign={(input) => setAssignment(writer, input)}
              onCopyLastMonth={(month) =>
                copyLastMonth(writer, {
                  month,
                  skipping: hiddenCategoryIds(writer),
                })
              }
              onMoveMoney={(input) => moveMoney(writer, input)}
            />
            <section aria-label="Manage Categories">
              <p>Kept in {budget.currency}.</p>
              <CategoryList />
            </section>
          </>
        )}
        {place === "activity" && (
          <AccountTransactions
            currency={budget.currency}
            onRecord={(input) => recordTransaction(writer, input)}
            onEdit={(id, input) => editTransaction(writer, id, input)}
            onDelete={(id) => deleteTransaction(writer, id)}
            onDeleteRedeclaredBalance={(id) =>
              deleteRedeclaredBalance(writer, id)
            }
          />
        )}
        {place === "accounts" && (
          <>
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
            <TransfersScreen
              currency={budget.currency}
              onMake={(input) => makeTransfer(writer, input)}
              onEdit={(id, input) => editTransfer(writer, id, input)}
              onDelete={(id) => deleteTransfer(writer, id)}
            />
          </>
        )}
      </Page>
    </NavigationShell>
  );
}

/** The Transactions screen for what the address bar says it's showing (`?account=<id>&statement=YYYY-MM`). */
function AccountTransactions(
  props: Omit<ComponentProps<typeof TransactionsScreen>, "showing" | "onShow">,
) {
  const [accountId] = useUrlParameter("account");
  const [statementMonth] = useUrlParameter("statement");
  return (
    <TransactionsScreen
      showing={{
        accountId: accountId ?? undefined,
        month: parseMonth(statementMonth),
      }}
      onShow={({ accountId, month }) =>
        pushAddress(placeAddress("activity", accountId, month))
      }
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
