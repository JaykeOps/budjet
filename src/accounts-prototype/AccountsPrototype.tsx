// PROTOTYPE (prototype/accounts): throwaway. Three ways to show the Accounts
// tab, an Account's page and Activity for "What do the Accounts tab, an
// Account's page and Activity look like?" (#82), switchable via
// `?accounts=A|B|C`, inside the navigation frame from #76: phone tabs
// Budget · Activity · (+) · Accounts, desktop rail with Record, Budget, All
// Accounts and each Account. `?place=accounts|activity|<account id>` is the
// screen (the tabs and rail work), `?frame=phone|desktop`,
// `?scheme=system|dark|light`. Everything is in memory; Reset starts over.
// A, Ledger: a list of Accounts, then an Account page with an action row and
// day-grouped history with a running balance. B, Check-in: every Account
// leads with "Does this match your bank?" and history reads as Month
// statements. C, One screen: Accounts as cards you swipe between with the
// history below, the balance itself is what you tap to re-declare, and on
// desktop a selected entry opens a panel showing both sides of a Transfer.
import "@fontsource-variable/geist";
import { type ReactNode, useEffect, useState } from "react";
import { useUrlParameter } from "../url-parameter";
import "../budget-screen-prototype/prototype.css";
import "../record-prototype/record.css";
import "./accounts.css";

type Kind = "checking" | "savings" | "cash";
type Account = {
  id: string;
  name: string;
  kind: Kind;
  closed: boolean;
};
type Entry =
  | {
      kind: "opening";
      id: string;
      date: string;
      account: string;
      amount: number;
    }
  | {
      kind: "tx";
      id: string;
      date: string;
      account: string;
      payee: string;
      /** Null: money in to Ready to Assign. */
      category: string | null;
      amount: number;
    }
  | {
      kind: "transfer";
      id: string;
      date: string;
      from: string;
      to: string;
      amount: number;
    }
  | {
      kind: "adjustment";
      id: string;
      date: string;
      account: string;
      amount: number;
      /** The balance the user declared. */
      declared: number;
    };
type Data = { accounts: Account[]; entries: Entry[] };

const variantKeys = ["A", "B", "C"] as const;
type VariantKey = (typeof variantKeys)[number];
const variantNames: Record<VariantKey, string> = {
  A: "Ledger",
  B: "Check-in",
  C: "One screen",
};

const TODAY = "2026-10-24";
const kindNames: Record<Kind, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
};

let nextId = 1;
const id = () => `e${nextId++}`;
const tx = (
  date: string,
  account: string,
  payee: string,
  category: string | null,
  amount: number,
): Entry => ({ kind: "tx", id: id(), date, account, payee, category, amount });
const transfer = (
  date: string,
  from: string,
  to: string,
  amount: number,
): Entry => ({ kind: "transfer", id: id(), date, from, to, amount });

function seed(): Data {
  return {
    accounts: [
      { id: "checking", name: "Everyday", kind: "checking", closed: false },
      { id: "savings", name: "Savings", kind: "savings", closed: false },
      { id: "cash", name: "Wallet", kind: "cash", closed: false },
      {
        id: "joint",
        name: "Old joint account",
        kind: "checking",
        closed: true,
      },
    ],
    entries: [
      {
        kind: "opening",
        id: id(),
        date: "2026-08-01",
        account: "checking",
        amount: 1850,
      },
      {
        kind: "opening",
        id: id(),
        date: "2026-08-01",
        account: "savings",
        amount: 6000,
      },
      {
        kind: "opening",
        id: id(),
        date: "2026-08-01",
        account: "cash",
        amount: 120,
      },
      {
        kind: "opening",
        id: id(),
        date: "2026-08-01",
        account: "joint",
        amount: 340,
      },
      transfer("2026-08-14", "joint", "checking", 340),
      tx("2026-08-25", "checking", "Acme Corp", null, 3200),
      tx("2026-09-01", "checking", "Harbor Lettings", "Rent", -1400),
      tx("2026-09-06", "checking", "Green Basket", "Groceries", -142.18),
      tx("2026-09-12", "cash", "Farmers market", "Groceries", -31),
      tx("2026-09-19", "checking", "Lumen Electric", "Electricity", -88.4),
      tx("2026-09-25", "checking", "Acme Corp", null, 3200),
      transfer("2026-09-26", "checking", "savings", 500),
      tx("2026-09-28", "checking", "Noodle Bar", "Dining out", -46.2),
      tx("2026-10-01", "checking", "Harbor Lettings", "Rent", -1400),
      tx("2026-10-02", "checking", "Green Basket", "Groceries", -86.4),
      tx("2026-10-04", "checking", "Fuel Stop", "Transport", -48),
      tx("2026-10-07", "checking", "Corner Grocer", "Groceries", -112.35),
      tx("2026-10-09", "cash", "Farmers market", "Groceries", -22),
      tx("2026-10-10", "checking", "Lumen Electric", "Electricity", -62.18),
      tx("2026-10-12", "checking", "Parcelhouse", "Shopping", 34.99),
      tx("2026-10-14", "checking", "Pho 88", "Dining out", -38.5),
      transfer("2026-10-15", "checking", "savings", 500),
      tx("2026-10-18", "cash", "Bean There", "Dining out", -6.5),
      {
        kind: "adjustment",
        id: id(),
        date: "2026-10-18",
        account: "cash",
        amount: -4.25,
        declared: 56.25,
      },
      tx("2026-10-20", "savings", "Interest", null, 12.4),
      tx("2026-10-22", "checking", "City Rides", "Transport", -24),
      tx("2026-10-23", "checking", "Green Basket", "Groceries", -64.1),
      tx("2026-10-24", "checking", "Acme Corp", null, 3200),
      transfer("2026-10-24", "checking", "cash", 60),
    ],
  };
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => usd.format(n).replace("-", "−");
const signed = (n: number) => (n > 0 ? `+${money(n)}` : money(n));
const cents = (n: number) => Math.round(n * 100) / 100;
const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const asDate = (iso: string) => new Date(`${iso}T12:00`);
function dayName(iso: string) {
  if (iso === TODAY) return "Today";
  if (iso === "2026-10-23") return "Yesterday";
  return dayFormat.format(asDate(iso));
}
const monthOf = (iso: string) => iso.slice(0, 7);
const monthName = (month: string) => monthFormat.format(asDate(`${month}-01`));

/* ------------------------------------------------------------------ */
/* Reading the records                                                */
/* ------------------------------------------------------------------ */

function touches(e: Entry, account: string) {
  return e.kind === "transfer"
    ? e.from === account || e.to === account
    : e.account === account;
}
/** What the entry did to `account`'s balance. */
function amountFor(e: Entry, account: string) {
  if (e.kind === "transfer") {
    if (e.from === account) return -e.amount;
    if (e.to === account) return e.amount;
    return 0;
  }
  return e.account === account ? e.amount : 0;
}
function balance(d: Data, account: string) {
  return cents(d.entries.reduce((s, e) => s + amountFor(e, account), 0));
}
const byId = (d: Data, account: string) => {
  const a = d.accounts.find((x) => x.id === account);
  if (!a) throw new Error(account);
  return a;
};
const openAccounts = (d: Data) => d.accounts.filter((a) => !a.closed);
const total = (d: Data) =>
  cents(openAccounts(d).reduce((s, a) => s + balance(d, a.id), 0));
/** By date, and within a day in the order they were recorded. */
const oldestFirst = (entries: Entry[]) =>
  [...entries].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
const newestFirst = (entries: Entry[]) => oldestFirst(entries).reverse();

/** An Account's history, newest first, with its balance after each entry. */
function history(d: Data, account: string) {
  const oldest = oldestFirst(d.entries.filter((e) => touches(e, account)));
  let running = 0;
  const rows = oldest.map((e) => {
    running = cents(running + amountFor(e, account));
    return { entry: e, after: running };
  });
  return rows.reverse();
}
function lastChecked(d: Data, account: string) {
  return newestFirst(d.entries).find(
    (e) => e.kind === "adjustment" && e.account === account,
  )?.date;
}
function months(d: Data) {
  return [...new Set(newestFirst(d.entries).map((e) => monthOf(e.date)))];
}

/** What an entry is called and says, seen from `account` (or across all). */
function describe(d: Data, e: Entry, account?: string) {
  const name = (a: string) => byId(d, a).name;
  switch (e.kind) {
    case "tx":
      return {
        title: e.payee,
        sub: e.category ?? "Ready to Assign",
        amount: e.amount,
      };
    case "opening":
      return {
        title: "Opening Balance",
        sub: "Ready to Assign",
        amount: e.amount,
      };
    case "adjustment":
      return {
        title: e.amount === 0 ? "Balance checked" : "Adjustment",
        sub:
          e.amount === 0
            ? `Matched your bank at ${money(e.declared)}`
            : `You updated the balance to ${money(e.declared)}`,
        amount: e.amount,
      };
    case "transfer":
      if (account === e.from)
        return {
          title: `To ${name(e.to)}`,
          sub: "Transfer",
          amount: -e.amount,
        };
      if (account === e.to)
        return {
          title: `From ${name(e.from)}`,
          sub: "Transfer",
          amount: e.amount,
        };
      return {
        title: `${name(e.from)} to ${name(e.to)}`,
        sub: "Transfer",
        amount: e.amount,
      };
  }
}
/** The Account(s) an entry belongs to, for Activity. */
function accountLine(d: Data, e: Entry) {
  return e.kind === "transfer"
    ? `${byId(d, e.from).name} → ${byId(d, e.to).name}`
    : byId(d, e.account).name;
}

/* ------------------------------------------------------------------ */
/* The shell                                                          */
/* ------------------------------------------------------------------ */

type Sheet =
  | { kind: "transfer"; from: string; amount?: number }
  | { kind: "redeclare"; account: string }
  | { kind: "rename"; account: string }
  | { kind: "close"; account: string }
  | { kind: "add" }
  | { kind: "entry"; entry: string };

type Actions = {
  open(sheet: Sheet): void;
  go(place: string): void;
  change(next: Data, text: string): void;
};
type VariantProps = {
  data: Data;
  place: string;
  wide: boolean;
  act: Actions;
};

export function AccountsPrototype() {
  const [variantParam, setVariant] = useUrlParameter("accounts");
  const [placeParam, setPlace] = useUrlParameter("place");
  const [frameParam, setFrame] = useUrlParameter("frame");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const key: VariantKey = variantKeys.find((k) => k === variantParam) ?? "A";
  const frame =
    frameParam === "phone" || frameParam === "desktop"
      ? frameParam
      : window.innerWidth < 900
        ? "phone"
        : "desktop";
  const wide = frame === "desktop";
  const scheme = schemeParam ?? "dark";

  const [data, setData] = useState<Data>(seed);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: Data } | null>(null);
  const [run, setRun] = useState(0);

  const known = data.accounts.some((a) => a.id === placeParam);
  const place =
    placeParam === "activity" || known
      ? (placeParam as string)
      : wide
        ? "activity"
        : "accounts";

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  function cycle(by: number) {
    const i = variantKeys.indexOf(key);
    setVariant(
      variantKeys[(i + by + variantKeys.length) % variantKeys.length],
      "replace",
    );
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("[aria-modal='true']")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const act: Actions = {
    open: setSheet,
    go: (to) => setPlace(to, "push"),
    change(next, text) {
      setToast({ text, undo: data });
      setData(next);
      setSheet(null);
    },
  };

  const Variant = { A: VariantA, B: VariantB, C: VariantC }[key];
  const variant = (
    <Variant
      key={`${key}-${frame}-${run}`}
      data={data}
      place={place}
      wide={wide}
      act={act}
    />
  );
  const sheetView = sheet && (
    <SheetView
      sheet={sheet}
      data={data}
      wide={wide}
      act={act}
      onClose={() => setSheet(null)}
    />
  );
  const toastView = toast && (
    <div className="rt-toast ac-toast" role="status">
      <span>{toast.text}</span>
      <button
        type="button"
        className="rt-toast-undo"
        onClick={() => {
          setData(toast.undo);
          setToast(null);
        }}
      >
        Undo
      </button>
    </div>
  );

  return (
    <div className="bs rt ac" data-scheme={scheme} data-frame={frame}>
      {wide ? (
        <div className="bs-desktop">
          <Rail
            data={data}
            place={place}
            go={act.go}
            onAdd={() => setSheet({ kind: "add" })}
          />
          <main className="bs-main">{variant}</main>
          {sheetView}
          {toastView}
        </div>
      ) : (
        <div className="bs-device">
          <div className="bs-phone">
            {variant}
            <TabBar place={place} go={act.go} />
            {sheetView}
            {toastView}
          </div>
        </div>
      )}

      {import.meta.env.DEV && (
        <div className="bs-switcher">
          <button
            type="button"
            onClick={() => cycle(-1)}
            aria-label="Previous variant"
          >
            ←
          </button>
          <span>
            {key} ({variantNames[key]})
          </span>
          <button
            type="button"
            onClick={() => cycle(1)}
            aria-label="Next variant"
          >
            →
          </button>
          <select
            value={frame}
            onChange={(e) => setFrame(e.target.value, "replace")}
            aria-label="Frame"
          >
            <option value="phone">Phone</option>
            <option value="desktop">Desktop</option>
          </select>
          <select
            value={scheme}
            onChange={(e) => setScheme(e.target.value, "replace")}
            aria-label="Scheme"
          >
            <option value="system">Follow system</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setData(seed());
              setSheet(null);
              setToast(null);
              setRun(run + 1);
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A. Ledger: the Accounts tab is a plain list with the total on top  */
/* and closed Accounts folded away at the bottom. An Account's page   */
/* leads with its balance and a row of three actions (Transfer,       */
/* Update balance, More), then its history by day, each row showing   */
/* the balance after it, like a bank statement. Activity is the same  */
/* list across Accounts, narrowed by Account chips and a Month menu.  */
/* ------------------------------------------------------------------ */

function VariantA({ data: d, place, wide, act }: VariantProps) {
  if (place === "activity") return <ActivityA data={d} wide={wide} act={act} />;
  if (place === "accounts") return <AccountsListA data={d} act={act} />;
  const a = byId(d, place);
  const rows = history(d, a.id);
  return (
    <div className="stack">
      {!wide && (
        <button
          type="button"
          className="link ac-back"
          onClick={() => act.go("accounts")}
        >
          ‹ Accounts
        </button>
      )}
      <header className="ac-acct-head">
        <div>
          <h1 className="title">{a.name}</h1>
          <p className="muted">
            {kindNames[a.kind]}
            {a.closed && ", closed"}
          </p>
        </div>
        <p className="ac-balance num">{money(balance(d, a.id))}</p>
      </header>
      {a.closed ? (
        <ClosedNote />
      ) : (
        <div className="ac-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => act.open({ kind: "transfer", from: a.id })}
          >
            Transfer
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => act.open({ kind: "redeclare", account: a.id })}
          >
            Update balance
          </button>
          <MoreMenu account={a.id} act={act} />
        </div>
      )}
      {wide ? (
        <LedgerTable
          data={d}
          rows={rows.map((r) => ({ ...r, account: a.id }))}
          act={act}
        />
      ) : (
        <DayGroups
          data={d}
          rows={rows.map((r) => ({ ...r, account: a.id }))}
          act={act}
        />
      )}
    </div>
  );
}

function AccountsListA({ data: d, act }: { data: Data; act: Actions }) {
  const closed = d.accounts.filter((a) => a.closed);
  return (
    <div className="stack">
      <header className="header">
        <h1 className="title">Accounts</h1>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => act.open({ kind: "add" })}
          >
            Add Account
          </button>
        </div>
      </header>
      <section className="card ac-total">
        <p className="muted">In your Accounts</p>
        <p className="ac-balance num">{money(total(d))}</p>
      </section>
      <ul className="card">
        {openAccounts(d).map((a) => (
          <li key={a.id} className="ac-li">
            <AccountRow data={d} account={a} onOpen={() => act.go(a.id)} />
          </li>
        ))}
      </ul>
      {closed.length > 0 && (
        <details className="ac-closed">
          <summary className="muted">Closed Accounts ({closed.length})</summary>
          <ul className="card">
            {closed.map((a) => (
              <li key={a.id} className="ac-li">
                <AccountRow data={d} account={a} onOpen={() => act.go(a.id)} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AccountRow({
  data: d,
  account: a,
  onOpen,
}: {
  data: Data;
  account: Account;
  onOpen(): void;
}) {
  return (
    <button type="button" className="ac-row" onClick={onOpen}>
      <Tile name={a.name} />
      <span className="ac-row-name">
        <span>{a.name}</span>
        <span className="small muted">{kindNames[a.kind]}</span>
      </span>
      <span className="num ac-row-amount">{money(balance(d, a.id))}</span>
    </button>
  );
}

function ActivityA({
  data: d,
  wide,
  act,
}: {
  data: Data;
  wide: boolean;
  act: Actions;
}) {
  const [account, setAccount] = useState("all");
  const [month, setMonth] = useState(monthOf(TODAY));
  const entries = newestFirst(
    d.entries.filter(
      (e) =>
        (account === "all" || touches(e, account)) &&
        (month === "all" || monthOf(e.date) === month),
    ),
  );
  const rows = entries.map((e) => ({
    entry: e,
    account: account === "all" ? undefined : account,
  }));
  return (
    <div className="stack">
      <header className="header">
        <h1 className="title">{wide ? "All Accounts" : "Activity"}</h1>
        <div className="header-actions">
          <label className="month ac-select">
            <span className="visually-hidden">Month</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months(d).map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
              <option value="all">Every Month</option>
            </select>
            <Chevron />
          </label>
        </div>
      </header>
      <fieldset className="ac-chips">
        <legend className="visually-hidden">Account</legend>
        {[
          { id: "all", name: "All Accounts" },
          ...openAccounts(d),
          ...d.accounts.filter((a) => a.closed),
        ].map((a) => (
          <button
            key={a.id}
            type="button"
            className="chip"
            aria-pressed={account === a.id}
            onClick={() => setAccount(a.id)}
          >
            {a.name}
          </button>
        ))}
      </fieldset>
      {rows.length === 0 ? (
        <p className="muted ac-empty">
          Nothing in {monthName(month)} for this Account.
        </p>
      ) : wide ? (
        <LedgerTable
          data={d}
          rows={rows}
          act={act}
          withAccount={account === "all"}
        />
      ) : (
        <DayGroups
          data={d}
          rows={rows}
          act={act}
          withAccount={account === "all"}
        />
      )}
    </div>
  );
}

type Row = { entry: Entry; after?: number; account?: string };

function DayGroups({
  data: d,
  rows,
  act,
  withAccount,
}: {
  data: Data;
  rows: Row[];
  act: Actions;
  withAccount?: boolean;
}) {
  const days = [...new Set(rows.map((r) => r.entry.date))];
  return (
    <>
      {days.map((day) => (
        <section key={day}>
          <h2 className="ac-day small muted">{dayName(day)}</h2>
          <ul className="card">
            {rows
              .filter((r) => r.entry.date === day)
              .map((r) => (
                <li key={r.entry.id} className="ac-li">
                  <EntryRow
                    data={d}
                    row={r}
                    act={act}
                    withAccount={withAccount}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function EntryRow({
  data: d,
  row: { entry: e, after, account },
  act,
  withAccount,
}: {
  data: Data;
  row: Row;
  act: Actions;
  withAccount?: boolean;
}) {
  const x = describe(d, e, account);
  return (
    <button
      type="button"
      className="ac-row"
      onClick={() => act.open({ kind: "entry", entry: e.id })}
    >
      <EntryTile entry={e} />
      <span className="ac-row-name">
        <span>{x.title}</span>
        <span className="small muted">
          {withAccount && e.kind !== "transfer"
            ? `${x.sub}, ${accountLine(d, e)}`
            : x.sub}
        </span>
      </span>
      <span className="ac-row-amount">
        <span
          className="num"
          data-direction={
            x.amount > 0 && e.kind !== "transfer" ? "in" : undefined
          }
        >
          {account || e.kind !== "transfer"
            ? signed(x.amount)
            : money(x.amount)}
        </span>
        {after !== undefined && (
          <span className="small muted num">{money(after)}</span>
        )}
      </span>
    </button>
  );
}

function LedgerTable({
  data: d,
  rows,
  act,
  withAccount,
}: {
  data: Data;
  rows: Row[];
  act: Actions;
  withAccount?: boolean;
}) {
  const running = rows.some((r) => r.after !== undefined);
  return (
    <div className="card ac-table">
      <table aria-label="History">
        <thead className="small muted">
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Payee</th>
            <th scope="col">Category</th>
            {withAccount && <th scope="col">Account</th>}
            <th scope="col" className="ac-right">
              Amount
            </th>
            {running && (
              <th scope="col" className="ac-right">
                Balance
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ entry: e, after, account }) => {
            const x = describe(d, e, account);
            return (
              <tr key={e.id}>
                <td className="muted">{dayName(e.date)}</td>
                <td>
                  <button
                    type="button"
                    className="ac-feed-open"
                    onClick={() => act.open({ kind: "entry", entry: e.id })}
                  >
                    {x.title}
                  </button>
                </td>
                <td className="muted">{x.sub}</td>
                {withAccount && <td className="muted">{accountLine(d, e)}</td>}
                <td
                  className="num ac-right"
                  data-direction={
                    x.amount > 0 && e.kind !== "transfer" ? "in" : undefined
                  }
                >
                  {account || e.kind !== "transfer"
                    ? signed(x.amount)
                    : money(x.amount)}
                </td>
                {running && (
                  <td className="num ac-right muted">
                    {after !== undefined && money(after)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MoreMenu({ account, act }: { account: string; act: Actions }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="ac-pop-host">
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        More
      </button>
      {open && (
        <div className="ac-menu card" role="menu">
          <button
            type="button"
            role="menuitem"
            className="b-menu-item"
            onClick={() => {
              setOpen(false);
              act.open({ kind: "rename", account });
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="b-menu-item"
            onClick={() => {
              setOpen(false);
              act.open({ kind: "close", account });
            }}
          >
            Close Account
          </button>
        </div>
      )}
    </span>
  );
}

function ClosedNote() {
  return (
    <p className="card ac-note muted">
      Closed. Its history stays here, and it takes no new Transactions or
      Transfers.
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* B. Check-in: what an Account is for, day to day, is "is budjet     */
/* right about it?", so each Account card and page leads with a       */
/* check: "Does this match your bank?" It matches, or type what it    */
/* says and see the Adjustment. History is Month statements, each     */
/* with what came in and went out, earlier Months folded. Activity    */
/* narrows through one "Showing" button that opens a sheet. On        */
/* desktop, the balance and actions are a sticky column on the right. */
/* ------------------------------------------------------------------ */

function VariantB({ data: d, place, wide, act }: VariantProps) {
  if (place === "activity") return <ActivityB data={d} wide={wide} act={act} />;
  if (place === "accounts") {
    const closed = d.accounts.filter((a) => a.closed);
    return (
      <div className="stack">
        <header className="header">
          <h1 className="title">Accounts</h1>
          <div className="header-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => act.open({ kind: "add" })}
            >
              <Plus /> Add
            </button>
          </div>
        </header>
        <section className="hero ac-hero">
          <p className="hero-muted">Money in your Accounts</p>
          <p className="display num">{money(total(d))}</p>
          <p className="small hero-muted">
            Every dollar here is in your Budget.
          </p>
        </section>
        {openAccounts(d).map((a) => (
          <section key={a.id} className="card ac-bcard">
            <button
              type="button"
              className="ac-bcard-open"
              onClick={() => act.go(a.id)}
            >
              <span>
                <span className="ac-bcard-name">{a.name}</span>
                <span className="small muted">{checkedLine(d, a.id)}</span>
              </span>
              <span className="ac-bcard-amount num">
                {money(balance(d, a.id))}
              </span>
            </button>
            <CheckIn data={d} account={a.id} act={act} compact />
          </section>
        ))}
        {closed.length > 0 && (
          <details className="ac-closed">
            <summary className="muted">
              Closed Accounts ({closed.length})
            </summary>
            <ul className="card">
              {closed.map((a) => (
                <li key={a.id} className="ac-li">
                  <AccountRow
                    data={d}
                    account={a}
                    onOpen={() => act.go(a.id)}
                  />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }
  const a = byId(d, place);
  const side = (
    <div className="stack">
      <section className="hero ac-hero">
        <p className="hero-muted">{kindNames[a.kind]}</p>
        <p className="display num">{money(balance(d, a.id))}</p>
        {!a.closed && (
          <p className="small hero-muted">{checkedLine(d, a.id)}</p>
        )}
      </section>
      {a.closed ? (
        <ClosedNote />
      ) : (
        <>
          <section className="card ac-check">
            <CheckIn data={d} account={a.id} act={act} />
          </section>
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={() => act.open({ kind: "transfer", from: a.id })}
          >
            Transfer money
          </button>
        </>
      )}
    </div>
  );
  const head = (
    <header className="header">
      {!wide && (
        <button
          type="button"
          className="link"
          onClick={() => act.go("accounts")}
          aria-label="Accounts"
        >
          ‹
        </button>
      )}
      <h1 className="title">{a.name}</h1>
      {!a.closed && (
        <div className="header-actions">
          <MoreMenu account={a.id} act={act} />
        </div>
      )}
    </header>
  );
  const statements = (
    <Statements
      data={d}
      entries={d.entries.filter((e) => touches(e, a.id))}
      account={a.id}
      act={act}
    />
  );
  return wide ? (
    <div>
      {head}
      <div className="ac-b-columns">
        <div className="stack">{statements}</div>
        <aside className="ac-b-side">{side}</aside>
      </div>
    </div>
  ) : (
    <div className="stack">
      {head}
      {side}
      {statements}
    </div>
  );
}

function checkedLine(d: Data, account: string) {
  const checked = lastChecked(d, account);
  return checked
    ? `Checked ${dayName(checked).replace(/^[A-Z][a-z]+, /, "")}`
    : "Not checked yet";
}

function CheckIn({
  data: d,
  account,
  act,
  compact,
}: {
  data: Data;
  account: string;
  act: Actions;
  compact?: boolean;
}) {
  const [typing, setTyping] = useState(false);
  const current = balance(d, account);
  const name = byId(d, account).name;
  if (typing)
    return (
      <RedeclareFields
        data={d}
        account={account}
        act={act}
        onCancel={() => setTyping(false)}
      />
    );
  return (
    <div className="ac-checkin" data-compact={compact}>
      {!compact && <p>Does {money(current)} match what your bank says?</p>}
      <div className="row-gap">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            act.change(
              {
                ...d,
                entries: [
                  ...d.entries,
                  {
                    kind: "adjustment",
                    id: id(),
                    date: TODAY,
                    account,
                    amount: 0,
                    declared: current,
                  },
                ],
              },
              `${name} matches your bank`,
            )
          }
        >
          {compact ? "Matches my bank" : "It matches"}
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => setTyping(true)}
        >
          {compact ? "Update" : "It's different"}
        </button>
      </div>
    </div>
  );
}

function Statements({
  data: d,
  entries,
  account,
  act,
}: {
  data: Data;
  entries: Entry[];
  account?: string;
  act: Actions;
}) {
  const rows = account
    ? history(d, account)
    : newestFirst(entries).map((entry) => ({ entry, after: undefined }));
  const ms = [...new Set(rows.map((r) => monthOf(r.entry.date)))];
  return (
    <>
      {ms.map((m, i) => {
        const inMonth = rows.filter((r) => monthOf(r.entry.date) === m);
        const flows = inMonth.map((r) =>
          account
            ? amountFor(r.entry, account)
            : r.entry.kind === "transfer"
              ? 0
              : r.entry.amount,
        );
        const cameIn = cents(
          flows.filter((n) => n > 0).reduce((s, n) => s + n, 0),
        );
        const wentOut = cents(
          -flows.filter((n) => n < 0).reduce((s, n) => s + n, 0),
        );
        return (
          <details key={m} className="ac-statement" open={i === 0}>
            <summary className="ac-statement-head">
              <span className="ac-statement-month">{monthName(m)}</span>
              <span className="small muted num">
                {money(cameIn)} in, {money(wentOut)} out
                {account && `, ended at ${money(inMonth[0].after ?? 0)}`}
              </span>
            </summary>
            <ul className="card">
              {inMonth.map((r) => (
                <li key={r.entry.id} className="ac-li">
                  <EntryRow
                    data={d}
                    row={{ entry: r.entry, account }}
                    act={act}
                    withAccount={!account}
                  />
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </>
  );
}

function ActivityB({
  data: d,
  wide,
  act,
}: {
  data: Data;
  wide: boolean;
  act: Actions;
}) {
  const [account, setAccount] = useState("all");
  const [month, setMonth] = useState("all");
  const [picking, setPicking] = useState(false);
  const entries = d.entries.filter(
    (e) =>
      (account === "all" || touches(e, account)) &&
      (month === "all" || monthOf(e.date) === month),
  );
  const showing = `${account === "all" ? "All Accounts" : byId(d, account).name}, ${month === "all" ? "every Month" : monthName(month)}`;
  return (
    <div className="stack">
      <header className="header">
        <h1 className="title">{wide ? "All Accounts" : "Activity"}</h1>
      </header>
      <button
        type="button"
        className="ac-showing card"
        onClick={() => setPicking(true)}
      >
        <span className="small muted">Showing</span>
        <span>{showing}</span>
        <Chevron />
      </button>
      {entries.length === 0 ? (
        <p className="muted ac-empty">Nothing here. Try another Month.</p>
      ) : (
        <Statements
          data={d}
          entries={entries}
          account={account === "all" ? undefined : account}
          act={act}
        />
      )}
      {picking && (
        <Overlay wide={wide} label="Show" onClose={() => setPicking(false)}>
          <div className="rt-body">
            <fieldset className="rt-fieldset">
              <legend className="small muted">Account</legend>
              <ul className="card rt-list">
                {[{ id: "all", name: "All Accounts" }, ...d.accounts].map(
                  (a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="rt-list-row"
                        aria-pressed={account === a.id}
                        onClick={() => setAccount(a.id)}
                      >
                        <span className="rt-list-name">{a.name}</span>
                        {account === a.id && "✓"}
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </fieldset>
            <fieldset className="rt-fieldset">
              <legend className="small muted">Month</legend>
              <div className="row-gap">
                {["all", ...months(d)].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="chip"
                    aria-pressed={month === m}
                    onClick={() => setMonth(m)}
                  >
                    {m === "all" ? "Every Month" : monthName(m)}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="rt-foot">
            <button
              type="button"
              className="btn btn-primary btn-wide"
              onClick={() => setPicking(false)}
            >
              Show {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* C. One screen: on a phone the Accounts tab is the Account page.    */
/* Accounts are cards you swipe between (the last card adds one, and  */
/* a closed one only shows once you ask), its history runs below the  */
/* cards, and the balance on the card is what you tap to re-declare,  */
/* in place, seeing the Adjustment before saving. Activity shows      */
/* every Account by Month; tapping an Account name in a row narrows   */
/* to it. On desktop, choosing an entry opens a panel beside the      */
/* history: a Transfer there shows both Accounts it touched.          */
/* ------------------------------------------------------------------ */

function VariantC({ data: d, place, wide, act }: VariantProps) {
  const [showClosed, setShowClosed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [narrow, setNarrow] = useState<string | null>(null);
  const [month, setMonth] = useState("all");
  const actC: Actions = wide
    ? {
        ...act,
        open: (s) => (s.kind === "entry" ? setSelected(s.entry) : act.open(s)),
      }
    : act;

  if (place === "activity") {
    const entries = newestFirst(
      d.entries.filter(
        (e) =>
          (!narrow || touches(e, narrow)) &&
          (month === "all" || monthOf(e.date) === month),
      ),
    );
    const ms = [...new Set(entries.map((e) => monthOf(e.date)))];
    const list = (
      <div className="stack">
        <header className="header">
          <h1 className="title">{wide ? "All Accounts" : "Activity"}</h1>
          <div className="header-actions">
            <label className="month ac-select">
              <span className="visually-hidden">Month</span>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="all">Every Month</option>
                {months(d).map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
              <Chevron />
            </label>
          </div>
        </header>
        {narrow && (
          <div className="row-gap">
            <button
              type="button"
              className="chip"
              aria-pressed
              onClick={() => setNarrow(null)}
            >
              Only {byId(d, narrow).name} <span aria-hidden>×</span>
              <span className="visually-hidden">, show every Account</span>
            </button>
          </div>
        )}
        {!narrow && (
          <p className="small muted">
            Tap an Account’s name to see only its money.
          </p>
        )}
        {ms.map((m) => (
          <section key={m}>
            <h2 className="ac-c-month">{monthName(m)}</h2>
            <ul className="card">
              {entries
                .filter((e) => monthOf(e.date) === m)
                .map((e) => (
                  <li key={e.id} className="ac-li">
                    <FeedRow
                      data={d}
                      entry={e}
                      account={narrow ?? undefined}
                      selected={selected === e.id}
                      act={actC}
                      onNarrow={setNarrow}
                    />
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    );
    return wide ? (
      <WithPanel
        data={d}
        selected={selected}
        onClose={() => setSelected(null)}
        act={act}
      >
        {list}
      </WithPanel>
    ) : (
      list
    );
  }

  const shown = d.accounts.filter(
    (a) => !a.closed || showClosed || a.id === place,
  );
  const current = place === "accounts" ? shown[0].id : place;
  const a = byId(d, current);
  const rows = history(d, a.id);
  const body = (
    <div className="stack">
      <header className="header">
        <h1 className="title">{wide ? a.name : "Accounts"}</h1>
        {!wide && (
          <p className="muted num ac-c-total">{money(total(d))} in all</p>
        )}
      </header>
      {!wide && (
        <div className="ac-cards" role="tablist" aria-label="Accounts">
          {shown.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={x.id === a.id}
              className="ac-ccard"
              data-closed={x.closed}
              onClick={() => act.go(x.id)}
            >
              <span className="small">{x.name}</span>
              <span className="ac-ccard-amount num">
                {money(balance(d, x.id))}
              </span>
              <span className="small muted">
                {x.closed ? "Closed" : kindNames[x.kind]}
              </span>
            </button>
          ))}
          <button
            type="button"
            className="ac-ccard ac-ccard-add"
            onClick={() => act.open({ kind: "add" })}
          >
            <Plus />
            <span className="small">Add Account</span>
          </button>
          {!showClosed && d.accounts.some((x) => x.closed) && (
            <button
              type="button"
              className="ac-ccard ac-ccard-add"
              onClick={() => setShowClosed(true)}
            >
              <span className="small">
                Closed ({d.accounts.filter((x) => x.closed).length})
              </span>
            </button>
          )}
        </div>
      )}
      <section className="card ac-c-focus">
        <InlineBalance key={a.id} data={d} account={a.id} act={act} />
        {a.closed ? (
          <p className="small muted">
            Closed. Its history stays, and it takes no new Transactions or
            Transfers.
          </p>
        ) : (
          <div className="row-gap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => act.open({ kind: "transfer", from: a.id })}
            >
              Transfer
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => act.open({ kind: "rename", account: a.id })}
            >
              Rename
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => act.open({ kind: "close", account: a.id })}
            >
              Close
            </button>
          </div>
        )}
      </section>
      <ul className="card">
        {rows.map((r) => (
          <li key={r.entry.id} className="ac-li">
            <FeedRow
              data={d}
              entry={r.entry}
              account={a.id}
              after={r.after}
              selected={selected === r.entry.id}
              act={actC}
            />
          </li>
        ))}
      </ul>
    </div>
  );
  return wide ? (
    <WithPanel
      data={d}
      selected={selected}
      onClose={() => setSelected(null)}
      act={act}
    >
      {body}
    </WithPanel>
  ) : (
    body
  );
}

function FeedRow({
  data: d,
  entry: e,
  account,
  after,
  selected,
  act,
  onNarrow,
}: {
  data: Data;
  entry: Entry;
  account?: string;
  after?: number;
  selected?: boolean;
  act: Actions;
  onNarrow?(account: string): void;
}) {
  const x = describe(d, e, account);
  const names = e.kind === "transfer" ? [e.from, e.to] : [e.account];
  return (
    <div className="ac-row ac-feed" data-selected={selected}>
      <EntryTile entry={e} />
      <span className="ac-row-name">
        <button
          type="button"
          className="ac-feed-open"
          onClick={() => act.open({ kind: "entry", entry: e.id })}
        >
          {x.title}
        </button>
        <span className="small muted">
          {dayName(e.date)}, {x.sub}
          {onNarrow && !account && (
            <>
              {", "}
              {names.map((n, i) => (
                <span key={n}>
                  {i > 0 && " → "}
                  <button
                    type="button"
                    className="ac-narrow"
                    onClick={() => onNarrow(n)}
                  >
                    {byId(d, n).name}
                  </button>
                </span>
              ))}
            </>
          )}
        </span>
      </span>
      <span className="ac-row-amount">
        <span
          className="num"
          data-direction={
            x.amount > 0 && e.kind !== "transfer" ? "in" : undefined
          }
        >
          {account || e.kind !== "transfer"
            ? signed(x.amount)
            : money(x.amount)}
        </span>
        {after !== undefined && (
          <span className="small muted num">{money(after)}</span>
        )}
      </span>
    </div>
  );
}

function InlineBalance({
  data: d,
  account,
  act,
}: {
  data: Data;
  account: string;
  act: Actions;
}) {
  const [editing, setEditing] = useState(false);
  const a = byId(d, account);
  const current = balance(d, account);
  if (editing)
    return (
      <RedeclareFields
        data={d}
        account={account}
        act={act}
        onCancel={() => setEditing(false)}
        autoFocus
      />
    );
  return (
    <div>
      <p className="small muted">
        {a.closed ? "Balance" : "Balance, tap to match your bank"}
      </p>
      {a.closed ? (
        <p className="ac-balance num">{money(current)}</p>
      ) : (
        <button
          type="button"
          className="ac-balance ac-balance-edit num"
          onClick={() => setEditing(true)}
        >
          {money(current)}
          <span className="visually-hidden">, update balance</span>
        </button>
      )}
    </div>
  );
}

function WithPanel({
  data: d,
  selected,
  onClose,
  act,
  children,
}: {
  data: Data;
  selected: string | null;
  onClose(): void;
  act: Actions;
  children: ReactNode;
}) {
  const e = d.entries.find((x) => x.id === selected);
  return (
    <div className="ac-c-columns">
      {children}
      <aside className="card ac-panel" aria-label="Entry">
        {e ? (
          <EntryDetail data={d} entry={e} onClose={onClose} act={act} />
        ) : (
          <p className="muted">Choose an entry to see it here.</p>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sheets shared by every variant                                     */
/* ------------------------------------------------------------------ */

function SheetView({
  sheet,
  data: d,
  wide,
  act,
  onClose,
}: {
  sheet: Sheet;
  data: Data;
  wide: boolean;
  act: Actions;
  onClose(): void;
}) {
  switch (sheet.kind) {
    case "transfer":
      return (
        <Overlay wide={wide} label="Transfer" onClose={onClose}>
          <TransferForm
            data={d}
            from={sheet.from}
            amount={sheet.amount}
            act={act}
          />
        </Overlay>
      );
    case "redeclare":
      return (
        <Overlay wide={wide} label="Update balance" onClose={onClose}>
          <div className="rt-body">
            <RedeclareFields
              data={d}
              account={sheet.account}
              act={act}
              onCancel={onClose}
              autoFocus
            />
          </div>
        </Overlay>
      );
    case "rename":
      return (
        <Overlay wide={wide} label="Rename" onClose={onClose}>
          <RenameForm data={d} account={sheet.account} act={act} />
        </Overlay>
      );
    case "close":
      return (
        <Overlay wide={wide} label="Close Account" onClose={onClose}>
          <CloseForm data={d} account={sheet.account} act={act} />
        </Overlay>
      );
    case "add":
      return (
        <Overlay wide={wide} label="Add Account" onClose={onClose}>
          <AddForm data={d} act={act} />
        </Overlay>
      );
    case "entry": {
      const e = d.entries.find((x) => x.id === sheet.entry);
      if (!e) return null;
      return (
        <Overlay wide={wide} label={describe(d, e).title} onClose={onClose}>
          <div className="rt-body">
            <EntryDetail data={d} entry={e} act={act} />
          </div>
        </Overlay>
      );
    }
  }
}

function EntryDetail({
  data: d,
  entry: e,
  onClose,
  act,
}: {
  data: Data;
  entry: Entry;
  onClose?(): void;
  act: Actions;
}) {
  const x = describe(d, e);
  return (
    <div className="stack">
      {onClose && (
        <div className="split">
          <h2 className="ac-panel-title">{x.title}</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </div>
      )}
      <p className="ac-balance num">
        {e.kind === "transfer" ? money(e.amount) : signed(e.amount)}
      </p>
      <p className="muted">{dayFormat.format(asDate(e.date))}</p>
      {e.kind === "transfer" ? (
        <ul className="card rt-list">
          {[e.from, e.to].map((a) => (
            <li key={a} className="ac-row">
              <Tile name={byId(d, a).name} />
              <span className="ac-row-name">
                <span>{byId(d, a).name}</span>
                <span className="small muted">Now {money(balance(d, a))}</span>
              </span>
              <span className="num">{signed(amountFor(e, a))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <dl className="ac-dl">
          <div>
            <dt className="muted">Account</dt>
            <dd>{byId(d, e.account).name}</dd>
          </div>
          <div>
            <dt className="muted">
              {e.kind === "tx" && e.category ? "Category" : "Goes to"}
            </dt>
            <dd>
              {x.sub.startsWith("You") || x.sub.startsWith("Matched")
                ? "Ready to Assign"
                : x.sub}
            </dd>
          </div>
        </dl>
      )}
      <p className="small muted">
        {e.kind === "transfer"
          ? "A Transfer moves money between your Accounts. It isn't Spending and leaves Ready to Assign as it is."
          : e.kind === "adjustment"
            ? `You told budjet ${byId(d, e.account).name} held ${money(e.declared)}, so the difference went ${e.amount < 0 ? "out of" : "into"} Ready to Assign.`
            : "Editing opens the review screen from recording a Transaction (#79)."}
      </p>
      {e.kind !== "opening" && (
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            act.change(
              { ...d, entries: d.entries.filter((y) => y.id !== e.id) },
              `Deleted ${x.title}`,
            );
            onClose?.();
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}

function RedeclareFields({
  data: d,
  account,
  act,
  onCancel,
  autoFocus,
}: {
  data: Data;
  account: string;
  act: Actions;
  onCancel(): void;
  autoFocus?: boolean;
}) {
  const current = balance(d, account);
  const [typed, setTyped] = useState(current.toFixed(2));
  const declared = cents(Number.parseFloat(typed) || 0);
  const diff = cents(declared - current);
  const name = byId(d, account).name;
  return (
    <form
      className="stack ac-redeclare"
      onSubmit={(event) => {
        event.preventDefault();
        if (diff === 0) return onCancel();
        act.change(
          {
            ...d,
            entries: [
              ...d.entries,
              {
                kind: "adjustment",
                id: id(),
                date: TODAY,
                account,
                amount: diff,
                declared,
              },
            ],
          },
          `${name} is now ${money(declared)}`,
        );
      }}
    >
      <label className="rt-field">
        <span className="small muted">What your bank says {name} holds</span>
        <input
          inputMode="decimal"
          className="num"
          value={typed}
          ref={autoFocus ? focusOnMount : undefined}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>
      <p className="small" aria-live="polite">
        {diff === 0
          ? `That's what budjet has. Nothing changes.`
          : `budjet records an Adjustment of ${signed(diff)}. It ${diff > 0 ? "goes into" : "comes out of"} Ready to Assign.`}
      </p>
      <div className="row-gap">
        <button type="submit" className="btn btn-primary">
          {diff === 0 ? "Done" : "Update balance"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function TransferForm({
  data: d,
  from: initialFrom,
  amount,
  act,
}: {
  data: Data;
  from: string;
  amount?: number;
  act: Actions;
}) {
  const [from, setFrom] = useState(initialFrom);
  const others = openAccounts(d).filter((a) => a.id !== from);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [typed, setTyped] = useState(amount ? amount.toFixed(2) : "");
  const n = cents(Number.parseFloat(typed) || 0);
  return (
    <form
      className="ac-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (n <= 0 || !to) return;
        act.change(
          {
            ...d,
            entries: [
              ...d.entries,
              { kind: "transfer", id: id(), date: TODAY, from, to, amount: n },
            ],
          },
          `Moved ${money(n)} to ${byId(d, to).name}`,
        );
      }}
    >
      <div className="rt-body">
        <label className="rt-field">
          <span className="small muted">Amount</span>
          <input
            inputMode="decimal"
            className="num"
            placeholder="0.00"
            value={typed}
            ref={focusOnMount}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        <label className="rt-field">
          <span className="small muted">From</span>
          <select
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (e.target.value === to)
                setTo(
                  openAccounts(d).find((a) => a.id !== e.target.value)?.id ??
                    "",
                );
            }}
          >
            {openAccounts(d).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({money(balance(d, a.id))})
              </option>
            ))}
          </select>
        </label>
        <label className="rt-field">
          <span className="small muted">To</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({money(balance(d, a.id))})
              </option>
            ))}
          </select>
        </label>
        <p className="small muted">
          {n > 0
            ? `${byId(d, from).name} goes to ${money(balance(d, from) - n)}. Ready to Assign stays as it is.`
            : "A Transfer isn't Spending and leaves Ready to Assign as it is."}
        </p>
      </div>
      <div className="rt-foot">
        <button
          type="submit"
          className="btn btn-primary btn-wide"
          disabled={n <= 0 || !to}
        >
          Transfer {n > 0 ? money(n) : ""}
        </button>
      </div>
    </form>
  );
}

function RenameForm({
  data: d,
  account,
  act,
}: {
  data: Data;
  account: string;
  act: Actions;
}) {
  const a = byId(d, account);
  const [name, setName] = useState(a.name);
  return (
    <form
      className="ac-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        act.change(
          {
            ...d,
            accounts: d.accounts.map((x) =>
              x.id === account ? { ...x, name: name.trim() } : x,
            ),
          },
          `Renamed to ${name.trim()}`,
        );
      }}
    >
      <div className="rt-body">
        <label className="rt-field">
          <span className="small muted">Name</span>
          <input
            value={name}
            ref={focusOnMount}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>
      <div className="rt-foot">
        <button
          type="submit"
          className="btn btn-primary btn-wide"
          disabled={!name.trim()}
        >
          Rename
        </button>
      </div>
    </form>
  );
}

function CloseForm({
  data: d,
  account,
  act,
}: {
  data: Data;
  account: string;
  act: Actions;
}) {
  const a = byId(d, account);
  const held = balance(d, account);
  if (held !== 0)
    return (
      <>
        <div className="rt-body">
          <p>
            {a.name} holds {money(held)}. Transfer it to another Account first,
            then close {a.name}.
          </p>
        </div>
        <div className="rt-foot">
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={() =>
              act.open({ kind: "transfer", from: account, amount: held })
            }
          >
            Transfer {money(held)}
          </button>
        </div>
      </>
    );
  return (
    <>
      <div className="rt-body">
        <p>
          Its history stays, and it takes no new Transactions or Transfers. You
          can't open it again.
        </p>
      </div>
      <div className="rt-foot">
        <button
          type="button"
          className="btn btn-danger btn-wide"
          onClick={() =>
            act.change(
              {
                ...d,
                accounts: d.accounts.map((x) =>
                  x.id === account ? { ...x, closed: true } : x,
                ),
              },
              `Closed ${a.name}`,
            )
          }
        >
          Close {a.name}
        </button>
      </div>
    </>
  );
}

function AddForm({ data: d, act }: { data: Data; act: Actions }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("checking");
  const [typed, setTyped] = useState("");
  const n = cents(Number.parseFloat(typed) || 0);
  return (
    <form
      className="ac-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        const accountId = `a${nextId++}`;
        act.change(
          {
            accounts: [
              ...d.accounts,
              { id: accountId, name: name.trim(), kind, closed: false },
            ],
            entries: [
              ...d.entries,
              {
                kind: "opening",
                id: id(),
                date: TODAY,
                account: accountId,
                amount: n,
              },
            ],
          },
          `Added ${name.trim()}`,
        );
        act.go(accountId);
      }}
    >
      <div className="rt-body">
        <label className="rt-field">
          <span className="small muted">Name</span>
          <input
            value={name}
            ref={focusOnMount}
            placeholder="e.g. Joint checking"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset className="seg">
          <legend className="visually-hidden">Kind</legend>
          {(Object.keys(kindNames) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {kindNames[k]}
            </button>
          ))}
        </fieldset>
        <label className="rt-field">
          <span className="small muted">What it holds today</span>
          <input
            inputMode="decimal"
            className="num"
            placeholder="0.00"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        <p className="small muted">
          This is its Opening Balance. It goes to Ready to Assign, for you to
          give every dollar a job.
        </p>
      </div>
      <div className="rt-foot">
        <button
          type="submit"
          className="btn btn-primary btn-wide"
          disabled={!name.trim()}
        >
          Add Account
        </button>
      </div>
    </form>
  );
}

/** Focuses an input once, when its sheet opens. */
function focusOnMount(input: HTMLInputElement | null) {
  input?.focus();
}

function Overlay({
  wide,
  label,
  onClose,
  children,
}: {
  wide: boolean;
  label: string;
  onClose(): void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className={wide ? "ac-scrim" : "rt-scrim"}>
      <div
        className={wide ? "ac-dialog" : "rt-sheet"}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="rt-head">
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
          <h2 className="rt-title">{label}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The frame (#76)                                                    */
/* ------------------------------------------------------------------ */

function Rail({
  data: d,
  place,
  go,
  onAdd,
}: {
  data: Data;
  place: string;
  go(p: string): void;
  onAdd(): void;
}) {
  const [closed, setClosed] = useState(false);
  const link = (to: string, label: ReactNode, extra?: string) => (
    <a
      key={to}
      className={`rail-item ${extra ?? ""}`}
      aria-current={place === to ? "page" : undefined}
      href={`?place=${to}`}
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
    >
      {label}
    </a>
  );
  const shut = d.accounts.filter((a) => a.closed);
  return (
    <nav className="rail" aria-label="Places">
      <button type="button" className="btn btn-primary btn-wide">
        <Plus /> Record
      </button>
      <a className="rail-item" href="#budget">
        Budget
      </a>
      <p className="rail-head muted small">Accounts</p>
      {link(
        "activity",
        <>
          <span>All Accounts</span>
          <span className="num muted small">{money(total(d))}</span>
        </>,
      )}
      {openAccounts(d).map((a) =>
        link(
          a.id,
          <>
            <span>{a.name}</span>
            <span className="num muted small">{money(balance(d, a.id))}</span>
          </>,
          "rail-account",
        ),
      )}
      {shut.length > 0 && (
        <button
          type="button"
          className="link rail-add small"
          aria-expanded={closed}
          onClick={() => setClosed(!closed)}
        >
          Closed ({shut.length})
        </button>
      )}
      {closed &&
        shut.map((a) =>
          link(a.id, <span className="muted">{a.name}</span>, "rail-account"),
        )}
      <button type="button" className="link rail-add small" onClick={onAdd}>
        + Add Account
      </button>
    </nav>
  );
}

function TabBar({ place, go }: { place: string; go(p: string): void }) {
  const accounts = place !== "activity";
  return (
    <nav className="tabs" aria-label="Places">
      <span className="tab">
        <TabIcon d="M4 5h14M4 11h9M4 17h11" />
        Budget
      </span>
      <button
        type="button"
        className="tab ac-tab"
        aria-current={!accounts ? "page" : undefined}
        onClick={() => go("activity")}
      >
        <TabIcon d="M3 12h4l3-7 4 14 3-7h3" />
        Activity
      </button>
      <button type="button" className="record" aria-label="Record">
        <Plus />
      </button>
      <button
        type="button"
        className="tab ac-tab"
        aria-current={accounts ? "page" : undefined}
        onClick={() => go("accounts")}
      >
        <TabIcon d="M3 8h16v10H3zM3 8l3-4h10l3 4M14 13h2" />
        Accounts
      </button>
    </nav>
  );
}

function Tile({ name }: { name: string }) {
  return (
    <span className="tile" aria-hidden>
      {name[0]}
    </span>
  );
}

function EntryTile({ entry: e }: { entry: Entry }) {
  const glyph =
    e.kind === "transfer"
      ? "⇄"
      : e.kind === "adjustment"
        ? "±"
        : e.kind === "opening"
          ? "★"
          : e.payee[0];
  return (
    <span className="tile" data-kind={e.kind} aria-hidden>
      {glyph}
    </span>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path
        d="M3 4.5 6 7.5 9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Plus() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden>
      <path
        d="M11 4v14M4 11h14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TabIcon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
