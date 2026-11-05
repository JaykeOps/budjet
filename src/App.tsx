import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { AccountsPlace } from "./AccountsPlace";
import { FolderBanner, type FolderConnection } from "./FolderBanner";
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
import { RecordMenu } from "./RecordMenu";
import {
  AddAccountSheet,
  OpenAccountForm,
  useAccounts,
} from "./slices/accounts";
import { openAccount } from "./slices/accounts/commands";
import {
  copyLastMonth,
  moveMoney,
  setAssignment,
} from "./slices/assignments/commands";
import { type Budget, useBudget } from "./slices/budget-setup";
import { CategoryList, categoryGroups } from "./slices/categories";
import { MonthBudget } from "./slices/month-budget-view";
import { TransactionsScreen } from "./slices/transactions";
import { recordTransaction } from "./slices/transactions/commands";
import { Toasts, useToast } from "./ui/Toast";
import { useHistoryChanges } from "./undo";
import { pushAddress, useUrlParameter } from "./url-parameter";

type KeepInFolder = ComponentProps<typeof FirstRun>["keepInFolder"];

export function App({
  writer,
  keepInFolder,
  folderChosen,
  folderConnection,
}: {
  writer: ChangeLogWriter;
  keepInFolder: KeepInFolder;
  /** A folder is already chosen for the Budget setup is about to write. */
  folderChosen?: boolean;
  /** Absent where a Budget can only live in Browser storage. */
  folderConnection?: FolderConnection;
}) {
  return (
    <ChangeLogWriterProvider value={writer}>
      <Root
        keepInFolder={keepInFolder}
        folderChosen={folderChosen}
        folderConnection={folderConnection}
      />
    </ChangeLogWriterProvider>
  );
}

/** `titled` is false for a screen with its own top-level heading. */
function Page({
  titled = true,
  folderConnection,
  children,
}: {
  titled?: boolean;
  folderConnection?: FolderConnection;
  children: ReactNode;
}) {
  return (
    <main>
      {folderConnection && <FolderBanner connection={folderConnection} />}
      {titled && <h1>budjet</h1>}
      {children}
      <p>Version {__APP_VERSION__}</p>
    </main>
  );
}

/** First run, which has no navigation, until there's a Budget, then the Budget. */
function Root({
  keepInFolder,
  folderChosen,
  folderConnection,
}: {
  keepInFolder: KeepInFolder;
  folderChosen?: boolean;
  folderConnection?: FolderConnection;
}) {
  const budget = useBudget();
  const hasBudget = budget !== undefined;

  // Asking once there's something to keep, because some browsers show a prompt.
  useEffect(() => {
    if (hasBudget) requestPersistentStorage();
  }, [hasBudget]);

  if (!budget) {
    return <FirstRun keepInFolder={keepInFolder} folderChosen={folderChosen} />;
  }
  return (
    <Toasts>
      <Shell budget={budget} folderConnection={folderConnection} />
    </Toasts>
  );
}

/**
 * Shows the place the user is at, inside the navigation. A Budget with no
 * Account yet can only come from an older setup, or a page closed while first
 * run was writing, so it asks for one, without navigation.
 */
function Shell({
  budget,
  folderConnection,
}: {
  budget: Budget;
  folderConnection?: FolderConnection;
}) {
  const writer = useChangeLogWriter();
  const accounts = useAccounts();
  const place = usePlace();
  const toast = useToast();
  const historyChanges = useHistoryChanges();
  const [addingAccount, setAddingAccount] = useState(false);

  if (accounts.length === 0) {
    return (
      <Page folderConnection={folderConnection}>
        <OpenAccountForm
          label="Add your first Account"
          currency={budget.currency}
          onOpen={(input) => openAccount(writer, input)}
        />
      </Page>
    );
  }
  return (
    <NavigationShell
      onAddAccount={() => setAddingAccount(true)}
      plus={<RecordMenu currency={budget.currency} />}
    >
      <Page titled={place === "activity"} folderConnection={folderConnection}>
        {place === "budget" && (
          <>
            <BudgetMonth
              firstMonth={budget.firstMonth}
              currency={budget.currency}
              onAssign={(input) => setAssignment(writer, input)}
              onCopyLastMonth={(month, unticked) =>
                copyLastMonth(writer, {
                  month,
                  skipping: [...hiddenCategoryIds(writer), ...unticked],
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
            {...historyChanges}
          />
        )}
        {place === "accounts" && (
          <AccountsPlace
            currency={budget.currency}
            onAddAccount={() => setAddingAccount(true)}
          />
        )}
      </Page>
      <AddAccountSheet
        isOpen={addingAccount}
        onClose={() => setAddingAccount(false)}
        currency={budget.currency}
        onOpen={(input) => {
          const id = openAccount(writer, input);
          setAddingAccount(false);
          toast({ text: `Added ${input.name.trim()}` });
          pushAddress(placeAddress("accounts", id));
          window.scrollTo(0, 0);
        }}
      />
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
