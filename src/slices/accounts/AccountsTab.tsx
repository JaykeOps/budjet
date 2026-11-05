import { useId } from "react";
import { formatMoney } from "../../kernel/money";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import styles from "./Accounts.module.css";
import { checkedLine } from "./account-lines";
import { BalanceCheck, type BalanceCheckActions } from "./BalanceCheck";
import { accounts, accountsTotal } from "./queries";

/**
 * The total, then a card per open Account that asks whether it matches the
 * bank, then the closed ones folded away. Tapping an Account drills in.
 */
export function AccountsTab({
  onAdd,
  onOpenAccount,
  ...check
}: BalanceCheckActions & {
  onAdd: () => void;
  onOpenAccount: (accountId: string) => void;
}) {
  const headingId = useId();
  const totalId = useId();
  const all = useChangeLogQuery(accounts);
  const total = useChangeLogQuery(accountsTotal);
  const open = all.filter(({ closed }) => !closed);
  const closed = all.filter(({ closed }) => closed);

  return (
    <section aria-labelledby={headingId} className={styles.screen}>
      <header className={styles.head}>
        <h1 id={headingId} className={styles.title}>
          Accounts
        </h1>
        <button type="button" aria-label="Add Account" onClick={onAdd}>
          + Add
        </button>
      </header>
      <div className={styles.graphite}>
        <p id={totalId} className={styles.graphiteLine}>
          Money in your Accounts
        </p>
        <div role="status" aria-labelledby={totalId}>
          <strong className={styles.graphiteAmount}>
            {total && formatMoney(total)}
          </strong>
        </div>
        <p className={styles.graphiteLine}>
          Every dollar here is in your Budget.
        </p>
      </div>
      {open.map((account) => (
        <section
          key={account.id}
          aria-label={account.name}
          className={styles.card}
        >
          <button
            type="button"
            className={styles.cardOpen}
            onClick={() => onOpenAccount(account.id)}
          >
            <span className={styles.cardName}>
              <span className={styles.name}>{account.name}</span>
              <span className={styles.muted}>
                {checkedLine(account.lastChecked)}
              </span>
            </span>
            <span className={styles.cardAmount}>
              {formatMoney(account.balance)}
            </span>
          </button>
          <BalanceCheck account={account} compact {...check} />
        </section>
      ))}
      {closed.length > 0 && (
        <details className={styles.closed}>
          <summary>Closed Accounts ({closed.length})</summary>
          <ul className={styles.closedList}>
            {closed.map(({ id, name, balance }) => (
              <li key={id}>
                <button
                  type="button"
                  className={styles.cardOpen}
                  onClick={() => onOpenAccount(id)}
                >
                  <span className={styles.name}>{name}</span>
                  <span>{formatMoney(balance)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
