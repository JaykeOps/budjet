import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { AccountsPlace } from "./AccountsPlace";
import { useCategoryChanges } from "./category-changes";
import { FolderBanner, type FolderConnection } from "./FolderBanner";
import { useFirstCategoryChanges } from "./first-categories";
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
import { isDesktop, useRecordingRow } from "./RecordingRow";
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
import { categoryGroups } from "./slices/categories";
import { MoveIntoFolderOffer } from "./slices/data-folder";
import { MonthBudget } from "./slices/month-budget-view";
import {
  RecordTransactionSheet,
  TransactionsScreen,
} from "./slices/transactions";
import { Toasts, useToast } from "./ui/Toast";
import { useHistoryChanges } from "./undo";
import { pushAddress, useUrlParameter } from "./url-parameter";
import { useRecordCommands } from "./use-record-commands";

type KeepInFolder = ComponentProps<typeof FirstRun>["keepInFolder"];
/** Absent where the browser has no folder picker. */
type FolderOffer = ComponentProps<typeof MoveIntoFolderOffer> | undefined;

export function App({
  writer,
  keepInFolder,
  folderChosen,
  folderConnection,
  folderOffer,
}: {
  writer: ChangeLogWriter;
  keepInFolder: KeepInFolder;
  /** A folder is already chosen for the Budget setup is about to write. */
  folderChosen?: boolean;
  /** Absent where a Budget can only live in Browser storage. */
  folderConnection?: FolderConnection;
  folderOffer: FolderOffer;
}) {
  return (
    <ChangeLogWriterProvider value={writer}>
      <Root
        keepInFolder={keepInFolder}
        folderChosen={folderChosen}
        folderConnection={folderConnection}
        folderOffer={folderOffer}
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
  folderOffer,
}: {
  keepInFolder: KeepInFolder;
  folderChosen?: boolean;
  folderConnection?: FolderConnection;
  folderOffer: FolderOffer;
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
      <Shell
        budget={budget}
        folderConnection={folderConnection}
        folderOffer={folderOffer}
      />
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
  folderOffer,
}: {
  budget: Budget;
  folderConnection?: FolderConnection;
  folderOffer: FolderOffer;
}) {
  const writer = useChangeLogWriter();
  const accounts = useAccounts();
  const place = usePlace();
  const toast = useToast();
  const historyChanges = useHistoryChanges();
  const [addingAccount, setAddingAccount] = useState(false);
  const recording = useRecordingRow(budget.currency);

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
      onRecord={() => recording.start()}
      recordButton={recording.recordButton}
      plus={<RecordMenu currency={budget.currency} />}
    >
      <Page titled={place === "activity"} folderConnection={folderConnection}>
        {folderOffer && <MoveIntoFolderOffer {...folderOffer} />}
        {place === "budget" && (
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
        )}
        {place === "activity" && (
          <AccountTransactions
            currency={budget.currency}
            onAddAccount={() => setAddingAccount(true)}
            onRecordInRow={() => recording.start()}
            recordRow={recording.row}
            {...historyChanges}
          />
        )}
        {place === "accounts" && (
          <AccountsPlace
            currency={budget.currency}
            onAddAccount={() => setAddingAccount(true)}
            recordRow={recording.row}
            onTransferInRow={recording.start}
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
function AccountTransactions({
  onRecordInRow,
  ...props
}: Omit<
  ComponentProps<typeof TransactionsScreen>,
  "showing" | "onShow" | "onRecordFirst"
> & { onRecordInRow: () => void }) {
  const [accountId] = useUrlParameter("account");
  const [statementMonth] = useUrlParameter("statement");
  const commands = useRecordCommands();
  // The row only shows on desktop, so a phone records through the sheet.
  const [recordingOnPhone, setRecordingOnPhone] = useState<{ into?: string }>();
  return (
    <>
      <TransactionsScreen
        showing={{
          accountId: accountId ?? undefined,
          month: parseMonth(statementMonth),
        }}
        onShow={({ accountId, month }) =>
          pushAddress(placeAddress("activity", accountId, month))
        }
        onRecordFirst={(into) =>
          isDesktop() ? onRecordInRow() : setRecordingOnPhone({ into })
        }
        {...props}
      />
      {recordingOnPhone && (
        <RecordTransactionSheet
          currency={props.currency}
          defaultAccountId={recordingOnPhone.into}
          onClose={() => setRecordingOnPhone(undefined)}
          onRecord={commands.record}
        />
      )}
    </>
  );
}

/** Copy last Month leaves hidden Categories out. */
function hiddenCategoryIds(writer: ChangeLogWriter): string[] {
  return categoryGroups(writer.changeLog.readAll())
    .flatMap((group) => group.categories)
    .filter(({ hidden }) => hidden)
    .map(({ id }) => id);
}

/** The Month Budget view for the Month in the address bar, and whether Edit is on (`?edit=on`). */
function BudgetMonth({
  firstMonth,
  ...props
}: Omit<
  ComponentProps<typeof MonthBudget>,
  | "month"
  | "onMonthChange"
  | "editing"
  | "onEditingChange"
  | "categoryChanges"
  | "firstCategoryChanges"
>) {
  const [month, setMonth] = useMonthInUrl(firstMonth);
  const [edit, setEdit] = useUrlParameter("edit");
  const categoryChanges = useCategoryChanges();
  const firstCategoryChanges = useFirstCategoryChanges();
  return (
    <MonthBudget
      month={month}
      firstMonth={firstMonth}
      onMonthChange={setMonth}
      editing={edit === "on"}
      onEditingChange={(on) => setEdit(on ? "on" : "off", "push")}
      categoryChanges={categoryChanges}
      firstCategoryChanges={firstCategoryChanges}
      {...props}
    />
  );
}
