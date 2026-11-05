import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { formatMoney } from "../../kernel/money";
import { Menu } from "../../ui/Menu";
import { OpenableSheet } from "../../ui/Sheet";
import styles from "./Accounts.module.css";
import { checkedLine, KIND_LABELS } from "./account-lines";
import { BalanceCheck, type BalanceCheckActions } from "./BalanceCheck";
import type { Account } from "./queries";

/**
 * One Account: its balance, the check and Transfer money, with `history` beside
 * them on desktop. A closed one only reads. The app shell decides what each
 * action does and provides the history, which belongs to Transactions.
 */
export function AccountPage({
  account,
  history,
  onBack,
  onTransfer,
  onRename,
  onClose,
  onTransferOut,
  ...check
}: BalanceCheckActions & {
  account: Account;
  history: ReactNode;
  onBack: () => void;
  onTransfer: (account: Account) => void;
  onRename: (account: Account, name: string) => void;
  onClose: (account: Account) => void;
  /** Starts the Transfer that empties an Account so it can close. */
  onTransferOut: (account: Account) => void;
}) {
  const [sheet, setSheet] = useState<"rename" | "close">();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  const focusHeadingIfLost = useCallback(() => {
    if (document.activeElement === document.body) heading.current?.focus();
  }, []);
  // Arriving removes what had focus, such as the card that was tapped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: arriving is what it runs on.
  useEffect(focusHeadingIfLost, [account.id, focusHeadingIfLost]);
  // So does closing the Account, which takes More away. The sheet gives up
  // focus a frame after it goes, so this looks once that has happened.
  useEffect(() => {
    if (!account.closed) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(focusHeadingIfLost);
    });
    return () => cancelAnimationFrame(frame);
  }, [account.closed, focusHeadingIfLost]);

  return (
    <section aria-labelledby={headingId} className={styles.screen}>
      <button type="button" className={styles.back} onClick={onBack}>
        ‹ Accounts
      </button>
      <header className={styles.head}>
        <h1 id={headingId} ref={heading} tabIndex={-1} className={styles.title}>
          {account.name}
        </h1>
        {!account.closed && (
          <Menu
            label={`More for ${account.name}`}
            actions={[
              { label: "Rename", onAction: () => setSheet("rename") },
              { label: "Close Account", onAction: () => setSheet("close") },
            ]}
          />
        )}
      </header>
      <div className={styles.columns}>
        <div className={styles.side}>
          <div className={styles.graphite}>
            <p className={styles.graphiteLine}>{KIND_LABELS[account.kind]}</p>
            <div role="status" aria-label={`Balance of ${account.name}`}>
              <strong className={styles.graphiteAmount}>
                {formatMoney(account.balance)}
              </strong>
            </div>
            {!account.closed && (
              <p className={styles.graphiteLine}>
                {checkedLine(account.lastChecked)}
              </p>
            )}
          </div>
          {account.closed ? (
            <p className={styles.card}>
              Closed. Its history stays here, and it takes no new Transactions
              or Transfers.
            </p>
          ) : (
            <>
              <div className={styles.card}>
                <BalanceCheck account={account} {...check} />
              </div>
              <button
                type="button"
                data-primary
                className={styles.wide}
                onClick={() => onTransfer(account)}
              >
                Transfer money
              </button>
            </>
          )}
        </div>
        <div className={styles.history}>{history}</div>
      </div>
      <OpenableSheet
        title={`Rename ${account.name}`}
        isOpen={sheet === "rename"}
        onClose={() => setSheet(undefined)}
      >
        {(close) => (
          <RenameForm
            account={account}
            onRename={(name) => {
              onRename(account, name);
              close();
            }}
          />
        )}
      </OpenableSheet>
      <OpenableSheet
        title={`Close ${account.name}`}
        isOpen={sheet === "close"}
        onClose={() => setSheet(undefined)}
      >
        {(close) =>
          account.balance.minorUnits === 0 ? (
            <>
              <p>
                Its history stays, and it takes no new Transactions or
                Transfers. You can't open it again.
              </p>
              <button
                type="button"
                data-primary
                className={styles.wide}
                onClick={() => {
                  onClose(account);
                  close();
                }}
              >
                Close {account.name}
              </button>
            </>
          ) : (
            <>
              <p>
                {account.name} holds {formatMoney(account.balance)}. Transfer it
                to another Account first, then close {account.name}.
              </p>
              <button
                type="button"
                data-primary
                className={styles.wide}
                onClick={() => {
                  close();
                  onTransferOut(account);
                }}
              >
                Transfer{" "}
                {formatMoney({
                  ...account.balance,
                  minorUnits: Math.abs(account.balance.minorUnits),
                })}
              </button>
            </>
          )
        }
      </OpenableSheet>
    </section>
  );
}

function RenameForm({
  account,
  onRename,
}: {
  account: Account;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(account.name);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onRename(name);
      }}
    >
      <label className={styles.field}>
        Name
        <input
          value={name}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button type="submit" className={styles.wide} disabled={!name.trim()}>
        Rename
      </button>
    </form>
  );
}
