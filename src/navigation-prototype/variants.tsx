// PROTOTYPE (prototype/navigation): throwaway. Three navigation frames for
// "How does budjet navigate on phone and on desktop?". Each lays out on a
// phone below 720px of width and on a desktop above it (a container query, so
// the switcher's Phone frame shows the phone layout on a desktop screen).
import { Fragment, useState } from "react";
import { useUrlParameter } from "../url-parameter";
import {
  AccountList,
  Activity,
  BudgetPage,
  ManageAccounts,
  RecordChooser,
  Register,
  Sheet,
  Transfers,
} from "./screens";

/** `""` stands for "none": useUrlParameter can set a parameter but not remove it. */
function useParameter(name: string) {
  const [value, write] = useUrlParameter(name);
  return [
    value || undefined,
    (to?: string) => write(to ?? "", "push"),
  ] as const;
}

/**
 * A: the reference design's tab bar, extended. Five places: Budget, Activity,
 * Accounts and Transfers, with (+) in the middle. On a desktop the tabs
 * become a sidebar and (+) a Record button at its top.
 */
export function TabBar() {
  const [tab = "budget", setTab] = useParameter("tab");
  const [account, setAccount] = useParameter("account");
  const [recording, setRecording] = useState(false);
  const tabs = [
    ["budget", "Budget", "◔"],
    ["activity", "Activity", "≡"],
    ["accounts", "Accounts", "▤"],
    ["transfers", "Transfers", "⇄"],
  ] as const;

  return (
    <div className="a-shell">
      <nav className="a-nav" aria-label="Main">
        <span className="a-brand">budjet</span>
        {tabs.map(([key, label, icon], index) => (
          <Fragment key={key}>
            {index === 2 && (
              <button
                type="button"
                className="a-record"
                onClick={() => setRecording(true)}
              >
                <span aria-hidden>+</span>
                <span className="a-record-label">Record</span>
              </button>
            )}
            <button
              type="button"
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                setTab(key);
                setAccount();
              }}
            >
              <span aria-hidden className="a-icon">
                {icon}
              </span>
              {label}
            </button>
          </Fragment>
        ))}
      </nav>
      <main className="a-main">
        {tab === "budget" && (
          <>
            <h1>Budget</h1>
            <BudgetPage />
          </>
        )}
        {tab === "activity" && (
          <>
            <h1>Activity</h1>
            <Activity />
          </>
        )}
        {tab === "accounts" &&
          (account ? (
            <>
              <button
                type="button"
                className="p-back"
                onClick={() => setAccount()}
              >
                ‹ Accounts
              </button>
              <Register accountId={account} onSelectAccount={setAccount} />
            </>
          ) : (
            <>
              <h1>Accounts</h1>
              <AccountList onSelect={setAccount} />
              <details>
                <summary>Add, re-declare, rename or close an Account</summary>
                <ManageAccounts />
              </details>
            </>
          ))}
        {tab === "transfers" && (
          <>
            <h1>Transfers</h1>
            <Transfers />
          </>
        )}
      </main>
      {recording && (
        <Sheet title="Record" onClose={() => setRecording(false)}>
          <RecordChooser />
        </Sheet>
      )}
    </div>
  );
}

/**
 * B: two places, Budget and Accounts, as YNAB arranges them. Accounts is a
 * hub: "All Accounts" is the Activity view, each Account opens its history,
 * and Transfers and re-declaring live inside an Account. On a desktop the
 * Accounts list is a permanent left rail with Budget at its top.
 */
export function AccountsHub() {
  const [place = "budget", setPlace] = useParameter("place");
  const [account, setAccount] = useParameter("account");
  const [sheet, setSheet] = useState<"record" | "transfer" | "manage">();
  const go = (to: string) => {
    if (to === "budget") {
      setPlace("budget");
      setAccount();
    } else {
      setPlace("accounts");
      setAccount(to);
    }
  };

  return (
    <div
      className="b-shell"
      data-place={place}
      data-detail={account ? "" : undefined}
    >
      <header className="b-top">
        <span className="a-brand">budjet</span>
        <div className="p-segmented" role="group" aria-label="Main">
          <button
            type="button"
            aria-pressed={place === "budget"}
            onClick={() => go("budget")}
          >
            Budget
          </button>
          <button
            type="button"
            aria-pressed={place === "accounts"}
            onClick={() => {
              setPlace("accounts");
              setAccount();
            }}
          >
            Accounts
          </button>
        </div>
      </header>
      <aside className="b-rail" aria-label="Accounts">
        <span className="a-brand">budjet</span>
        <button
          type="button"
          className="b-record"
          onClick={() => setSheet("record")}
        >
          + Record
        </button>
        <button
          type="button"
          className="b-budget"
          aria-current={place === "budget" || undefined}
          onClick={() => go("budget")}
        >
          Budget
        </button>
        <h2>Accounts</h2>
        <AccountList withAll selected={account} onSelect={go} />
        <button
          type="button"
          className="p-link"
          onClick={() => setSheet("manage")}
        >
          + Add or change an Account
        </button>
      </aside>
      <main className="b-main">
        {place === "budget" && (
          <>
            <h1>Budget</h1>
            <BudgetPage />
          </>
        )}
        {place === "accounts" && !account && (
          <div className="b-phone-list">
            <h1>Accounts</h1>
            <AccountList withAll onSelect={go} />
            <button
              type="button"
              className="p-link"
              onClick={() => setSheet("manage")}
            >
              + Add or change an Account
            </button>
          </div>
        )}
        {place === "accounts" && account && (
          <>
            <button
              type="button"
              className="p-back b-back"
              onClick={() => setAccount()}
            >
              ‹ Accounts
            </button>
            <div className="b-actions">
              <button type="button" onClick={() => setSheet("transfer")}>
                ⇄ Transfer
              </button>
              <button type="button" onClick={() => setSheet("manage")}>
                Re-declare balance
              </button>
            </div>
            {account === "all" ? (
              <>
                <h1>All Accounts</h1>
                <Activity />
              </>
            ) : (
              <Register accountId={account} onSelectAccount={go} />
            )}
          </>
        )}
      </main>
      <button
        type="button"
        className="b-fab"
        aria-label="Record"
        onClick={() => setSheet("record")}
      >
        +
      </button>
      {sheet === "record" && (
        <Sheet title="Record" onClose={() => setSheet(undefined)}>
          <RecordChooser />
        </Sheet>
      )}
      {sheet === "transfer" && (
        <Sheet title="Transfers" onClose={() => setSheet(undefined)}>
          <Transfers />
        </Sheet>
      )}
      {sheet === "manage" && (
        <Sheet title="Accounts" onClose={() => setSheet(undefined)}>
          <ManageAccounts />
        </Sheet>
      )}
    </div>
  );
}

/**
 * C: no navigation at all. The Budget is the only page; Accounts are a strip
 * of balances above it and everything else opens over it as a sheet. Two
 * record buttons replace (+). On a desktop, Activity is a permanent right
 * rail beside the Budget.
 */
export function BudgetOnly() {
  const [sheet, setSheet] = useParameter("sheet");

  return (
    <div className="c-shell">
      <header className="c-top">
        <span className="a-brand">budjet</span>
        <nav aria-label="Accounts" className="c-strip">
          <AccountList onSelect={(id) => setSheet(`account:${id}`)} />
          <button type="button" onClick={() => setSheet("transfers")}>
            Transfers
          </button>
          <button type="button" onClick={() => setSheet("manage")}>
            Manage
          </button>
        </nav>
      </header>
      <main className="c-main">
        <BudgetPage />
        <section className="c-recent">
          <h2>
            Recent{" "}
            <button
              type="button"
              className="p-link"
              onClick={() => setSheet("activity")}
            >
              See all
            </button>
          </h2>
          <Activity />
        </section>
      </main>
      <aside className="c-rail" aria-label="Activity">
        <div className="c-record">
          <button type="button" onClick={() => setSheet("record")}>
            + Spending or income
          </button>
          <button type="button" onClick={() => setSheet("transfers")}>
            ⇄ Transfer
          </button>
        </div>
        <h2>Activity</h2>
        <Activity />
      </aside>
      <footer className="c-dock">
        <button type="button" onClick={() => setSheet("record")}>
          + Spending or income
        </button>
        <button type="button" onClick={() => setSheet("transfers")}>
          ⇄
        </button>
      </footer>
      {sheet && (
        <Sheet title={sheetTitle(sheet)} onClose={() => setSheet()}>
          {sheet.startsWith("account:") && (
            <Register
              accountId={sheet.slice("account:".length)}
              onSelectAccount={(id) => setSheet(`account:${id}`)}
            />
          )}
          {sheet === "activity" && <Activity />}
          {sheet === "transfers" && <Transfers />}
          {sheet === "manage" && <ManageAccounts />}
          {sheet === "record" && <RecordChooser />}
        </Sheet>
      )}
    </div>
  );
}

function sheetTitle(sheet: string): string {
  if (sheet.startsWith("account:")) return "Account";
  return (
    {
      activity: "Activity",
      transfers: "Transfers",
      manage: "Accounts",
      record: "Record",
    }[sheet] ?? sheet
  );
}
