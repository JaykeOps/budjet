import { type MouseEvent, type ReactNode, useState } from "react";
import { formatMoney } from "./kernel/money";
import { useChangeLogQuery } from "./kernel/use-change-log-query";
import styles from "./NavigationShell.module.css";
import { type Place, placeAddress, usePlace } from "./place-in-url";
import { accountsTotal, useAccounts } from "./slices/accounts";
import { pushAddress, useUrlParameter, useUrlSearch } from "./url-parameter";

/**
 * The page's real navigation, around whatever place is showing: a floating tab
 * bar on a phone and a left rail on desktop. Which one shows is decided by
 * width alone, so both lead to the same places.
 *
 * Recording on desktop isn't rebuilt yet, so Record stands in by opening
 * Activity, where the Record a Transaction form is.
 */
export function NavigationShell({
  onAddAccount,
  plus,
  children,
}: {
  onAddAccount: () => void;
  /** The tab bar's (+). */
  plus: ReactNode;
  children: ReactNode;
}) {
  // Links are built from the address, so they have to follow it.
  useUrlSearch();
  const place = usePlace();
  const [accountId] = useUrlParameter("account");
  const here = { place, accountId: accountId ?? undefined };
  return (
    <div className={styles.shell}>
      <Rail here={here} onAddAccount={onAddAccount} />
      {children}
      <TabBar here={here} plus={plus} />
    </div>
  );
}

type Here = { place: Place; accountId?: string };

function Rail({
  here,
  onAddAccount,
}: {
  here: Here;
  onAddAccount: () => void;
}) {
  const accounts = useAccounts();
  const total = useChangeLogQuery(accountsTotal);
  const [showClosed, setShowClosed] = useState(false);
  const open = accounts.filter(({ closed }) => !closed);
  const closed = accounts.filter(({ closed }) => closed);
  const atAccount = (id: string) =>
    here.place === "accounts" && here.accountId === id;

  return (
    <nav className={styles.rail} aria-label="Places">
      <PlaceLink
        className={styles.record}
        to={placeAddress("activity", here.accountId)}
      >
        <PlusIcon />
        Record
      </PlaceLink>
      <PlaceLink
        className={styles.railItem}
        to={placeAddress("budget")}
        current={here.place === "budget"}
      >
        Budget
      </PlaceLink>
      <p className={styles.railHeading}>Accounts</p>
      <PlaceLink
        className={styles.railItem}
        to={placeAddress("activity")}
        current={here.place === "activity"}
      >
        <span className={styles.name}>All Accounts</span>{" "}
        {total && <span className={styles.amount}>{formatMoney(total)}</span>}
      </PlaceLink>
      {open.map(({ id, name, balance }) => (
        <PlaceLink
          key={id}
          className={styles.railItem}
          to={placeAddress("accounts", id)}
          current={atAccount(id)}
        >
          <span className={styles.name}>{name}</span>{" "}
          <span className={styles.amount}>{formatMoney(balance)}</span>
        </PlaceLink>
      ))}
      {closed.length > 0 && (
        <button
          type="button"
          className={styles.closedToggle}
          aria-expanded={showClosed}
          onClick={() => setShowClosed(!showClosed)}
        >
          Closed ({closed.length})
        </button>
      )}
      {showClosed &&
        closed.map(({ id, name }) => (
          <PlaceLink
            key={id}
            className={styles.railItem}
            to={placeAddress("accounts", id)}
            current={atAccount(id)}
          >
            <span className={styles.name}>{name}</span>
          </PlaceLink>
        ))}
      <button
        type="button"
        className={styles.addAccount}
        onClick={onAddAccount}
      >
        + Add Account
      </button>
    </nav>
  );
}

function TabBar({ here, plus }: { here: Here; plus: ReactNode }) {
  return (
    <nav className={styles.tabBar} aria-label="Places">
      <PlaceLink
        className={styles.tab}
        to={placeAddress("budget")}
        current={here.place === "budget"}
      >
        <TabIcon d="M4 12a8 8 0 1 1 8 8M12 4v8l-6 5" />
        Budget
      </PlaceLink>
      <PlaceLink
        className={styles.tab}
        to={placeAddress("activity")}
        current={here.place === "activity"}
      >
        <TabIcon d="M4 7h16M4 12h16M4 17h10" />
        Activity
      </PlaceLink>
      {plus}
      <PlaceLink
        className={styles.tab}
        to={placeAddress("accounts")}
        current={here.place === "accounts"}
      >
        <TabIcon d="M3 8h18v11H3zM3 8l3-4h12l3 4M15 13.5h3" />
        Accounts
      </PlaceLink>
    </nav>
  );
}

/** A real link, so it can open in a new tab, that otherwise stays in the app. */
function PlaceLink({
  to,
  current = false,
  className,
  children,
}: {
  to: string;
  current?: boolean;
  className: string | undefined;
  children: ReactNode;
}) {
  function follow(event: MouseEvent) {
    const opensElsewhere =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (opensElsewhere) return;
    event.preventDefault();
    pushAddress(to);
    window.scrollTo(0, 0);
  }
  return (
    <a
      className={className}
      href={to}
      aria-current={current ? "page" : undefined}
      onClick={follow}
    >
      {children}
    </a>
  );
}

function TabIcon({ d }: { d: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}
