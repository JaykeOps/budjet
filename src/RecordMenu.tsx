import { useState } from "react";
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { type Currency, formatMoney } from "./kernel/money";
import { useChangeLogWriter } from "./kernel/use-change-log-query";
import { PlusIcon } from "./NavigationShell";
import styles from "./RecordMenu.module.css";
import { useAccounts } from "./slices/accounts";
import { RecordTransactionSheet } from "./slices/transactions";
import {
  deleteTransaction,
  recordTransaction,
} from "./slices/transactions/commands";
import { TransferSheet } from "./slices/transfers";
import { deleteTransfer, makeTransfer } from "./slices/transfers/commands";
import { useToast } from "./ui/Toast";
import { useUrlParameter } from "./url-parameter";

/**
 * The tab bar's (+): a menu above it that starts recording a Transaction or
 * making a Transfer, in the Account showing if it's open. Stays in the place
 * it was opened from, and says what it did in a toast.
 */
export function RecordMenu({ currency }: { currency: Currency }) {
  const writer = useChangeLogWriter();
  const toast = useToast();
  const accounts = useAccounts();
  const [accountId] = useUrlParameter("account");
  const [opening, setOpening] = useState<"transaction" | "transfer">();
  const here = accounts.find(({ id, closed }) => id === accountId && !closed);

  return (
    <>
      <MenuTrigger>
        <Button className={styles.plus} aria-label="Record">
          <PlusIcon />
        </Button>
        <Popover
          className={styles.popover}
          placement="top"
          offset={12}
          containerPadding={16}
        >
          <Menu
            className={styles.menu}
            aria-label="Record"
            onAction={(key) =>
              setOpening(key === "transfer" ? "transfer" : "transaction")
            }
          >
            <MenuItem
              id="transaction"
              className={styles.item}
              textValue="Record a Transaction"
            >
              <span className={styles.label}>Record a Transaction</span>
              <span className={styles.description}>
                Money you spent or received
              </span>
            </MenuItem>
            <MenuItem
              id="transfer"
              className={styles.item}
              textValue="Make a Transfer"
            >
              <span className={styles.label}>Make a Transfer</span>
              <span className={styles.description}>
                Move money between your Accounts
              </span>
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
      {opening === "transaction" && (
        <RecordTransactionSheet
          currency={currency}
          defaultAccountId={here?.id}
          onClose={() => setOpening(undefined)}
          onRecord={(input) => {
            const id = recordTransaction(writer, input);
            const sign = input.amount.minorUnits > 0 ? "+" : "";
            const payee = input.payee?.trim();
            toast({
              text: `Recorded ${sign}${formatMoney(input.amount)}${payee ? ` at ${payee}` : ""}`,
              onUndo: () => deleteTransaction(writer, id),
            });
          }}
        />
      )}
      <TransferSheet
        title="Make a Transfer"
        isOpen={opening === "transfer"}
        onClose={() => setOpening(undefined)}
        currency={currency}
        draft={here ? { fromAccountId: here.id } : {}}
        onSubmit={(input) => {
          const id = makeTransfer(writer, input);
          toast({
            text: "Transfer made",
            onUndo: () => deleteTransfer(writer, id),
          });
        }}
      />
    </>
  );
}
