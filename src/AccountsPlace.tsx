import { type ReactNode, useState } from "react";
import { type Currency, formatMoney, type Money } from "./kernel/money";
import { useChangeLogWriter } from "./kernel/use-change-log-query";
import { placeAddress } from "./place-in-url";
import { isDesktop } from "./RecordingRow";
import {
  type Account,
  AccountPage,
  AccountsTab,
  useAccounts,
} from "./slices/accounts";
import {
  closeAccount,
  deleteRedeclaredBalance,
  redeclareBalance,
  renameAccount,
} from "./slices/accounts/commands";
import { AccountHistory } from "./slices/transactions";
import {
  deleteTransaction,
  editTransaction,
} from "./slices/transactions/commands";
import { type TransferDraft, TransferSheet } from "./slices/transfers";
import { deleteTransfer, editTransfer } from "./slices/transfers/commands";
import { useToast } from "./ui/Toast";
import { pushAddress, useUrlParameter } from "./url-parameter";
import { useRecordCommands } from "./use-record-commands";

function go(address: string) {
  pushAddress(address);
  window.scrollTo(0, 0);
}

/**
 * The Accounts place: the tab or, with `?account=<id>`, that Account's page.
 * Everything done to an Account starts here, so this is where the commands meet
 * their toasts. Add Account and Close Account can't be undone (no command
 * reverses them); every other toast's Undo writes a compensating record.
 */
export function AccountsPlace({
  currency,
  onAddAccount,
  recordRow,
  onTransferInRow,
}: {
  currency: Currency;
  onAddAccount: () => void;
  /** The row that records on desktop, if it's open. */
  recordRow: ReactNode;
  onTransferInRow: (draft: TransferDraft) => void;
}) {
  const writer = useChangeLogWriter();
  const toast = useToast();
  const commands = useRecordCommands();
  const accounts = useAccounts();
  const [accountId] = useUrlParameter("account");
  const [transfer, setTransfer] = useState<TransferDraft>();
  const account = accounts.find(({ id }) => id === accountId);
  /** A phone moves money in a sheet, and desktop in the row above the history. */
  const startTransfer = (draft: TransferDraft) =>
    isDesktop() ? onTransferInRow(draft) : setTransfer(draft);

  const check = {
    onMatches({ id, name, balance }: Account) {
      const recordId = redeclareBalance(writer, id, { balance });
      toast({
        text: `${name} matches your bank`,
        onUndo: () => deleteRedeclaredBalance(writer, recordId),
      });
    },
    onUpdate({ id, name }: Account, balance: Money) {
      const recordId = redeclareBalance(writer, id, { balance });
      toast({
        text: `${name} is now ${formatMoney(balance)}`,
        onUndo: () => deleteRedeclaredBalance(writer, recordId),
      });
    },
  };

  return (
    <>
      {account ? (
        <AccountPage
          account={account}
          history={
            <>
              {!account.closed && recordRow}
              <AccountHistory
                account={account}
                currency={currency}
                onEdit={(id, input) => editTransaction(writer, id, input)}
                onDelete={(id) => deleteTransaction(writer, id)}
                onDeleteRedeclaredBalance={(id) =>
                  deleteRedeclaredBalance(writer, id)
                }
                onEditTransfer={(id, input) => editTransfer(writer, id, input)}
                onDeleteTransfer={(id) => deleteTransfer(writer, id)}
              />
            </>
          }
          onBack={() => go(placeAddress("accounts"))}
          onTransfer={({ id }) => startTransfer({ fromAccountId: id })}
          onTransferOut={({ id, balance }) =>
            startTransfer(
              balance.minorUnits > 0
                ? { fromAccountId: id, amount: balance }
                : {
                    toAccountId: id,
                    amount: { ...balance, minorUnits: -balance.minorUnits },
                  },
            )
          }
          onRename={({ id, name: before }, name) => {
            renameAccount(writer, id, { name });
            toast({
              text: `Renamed to ${name.trim()}`,
              onUndo: () => renameAccount(writer, id, { name: before }),
            });
          }}
          onClose={({ id, name }) => {
            closeAccount(writer, id);
            toast({ text: `Closed ${name}` });
          }}
          {...check}
        />
      ) : (
        <AccountsTab
          onAdd={onAddAccount}
          onOpenAccount={(id) => go(placeAddress("accounts", id))}
          {...check}
        />
      )}
      <TransferSheet
        title="Transfer money"
        isOpen={transfer !== undefined}
        onClose={() => setTransfer(undefined)}
        currency={currency}
        draft={transfer ?? {}}
        onSubmit={commands.transfer}
      />
    </>
  );
}
