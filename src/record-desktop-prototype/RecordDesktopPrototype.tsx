// PROTOTYPE (prototype/record-desktop): throwaway. Three answers to "What does
// the desktop Record button open, and where does editing open from a history?"
// (#86), switchable via `?recd=A|B|C`, inside the frame and Account screens
// already settled (#76, #82). `?place=budget|activity|accounts|<account id>`,
// `?frame=phone|desktop`, `?scheme=system|dark|light`. Everything is in memory.
//
// Keyboard on desktop: Alt+N opens Record anywhere. In a form, Enter records
// (or moves to whatever is still missing), Shift+Enter records and keeps going
// in A, Esc closes, + or - in the amount flips money in or out.
//
// Chosen: C's behaviour on desktop, A's on a phone.
//
// A, Dialog: Record opens a one-page dialog over the screen. A row opens the
//    same dialog. Phone (chosen): a row goes straight to the review screen
//    from #79.
// B, Side panel: Record opens a panel in the right column and the page stays
//    live beside it, so each new row appears as you record. A row opens in the
//    panel. Phone: a row opens a read-first sheet, with Edit and Delete.
// C, In the list (chosen on desktop): Record adds an editable row above the
//    history; a row turns editable where it sits. From the Budget, Record goes
//    to All Accounts. Phone: a row unfolds into its fields in place.
//
// The phone's (+) flow is settled by #79 and is not rebuilt here.
import "@fontsource-variable/geist";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useUrlParameter } from "../url-parameter";
import "../budget-screen-prototype/prototype.css";
import "../record-prototype/record.css";
import "../accounts-prototype/accounts.css";
import "./record-desktop.css";

type Kind = "checking" | "savings" | "cash";
type Account = { id: string; name: string; kind: Kind; closed: boolean };
type Tx = {
  kind: "tx";
  id: string;
  date: string;
  account: string;
  payee: string;
  /** Null: money in to Ready to Assign. */
  category: string | null;
  amount: number;
};
type Transfer = {
  kind: "transfer";
  id: string;
  date: string;
  from: string;
  to: string;
  amount: number;
};
type Entry =
  | Tx
  | Transfer
  | {
      kind: "opening";
      id: string;
      date: string;
      account: string;
      amount: number;
    }
  | {
      kind: "adjustment";
      id: string;
      date: string;
      account: string;
      amount: number;
      declared: number;
    };
type Category = { name: string; group: string; had: number };
type Data = { accounts: Account[]; entries: Entry[] };

const variantKeys = ["A", "B", "C"] as const;
type VariantKey = (typeof variantKeys)[number];
const variantNames: Record<VariantKey, string> = {
  A: "Dialog",
  B: "Side panel",
  C: "In the list",
};

const TODAY = "2026-10-24";
const kindNames: Record<Kind, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
};
/** `had`: everything ever assigned, so Available = had − all Spending. */
const categories: Category[] = [
  { name: "Rent", group: "Bills", had: 2800 },
  { name: "Electricity", group: "Bills", had: 240 },
  { name: "Groceries", group: "Everyday", had: 1000 },
  { name: "Dining out", group: "Everyday", had: 110 },
  { name: "Transport", group: "Everyday", had: 180 },
  { name: "Shopping", group: "Everyday", had: 50 },
  { name: "Fun", group: "Life", had: 60 },
  { name: "Gifts", group: "Life", had: 0 },
  { name: "Holiday", group: "Savings", had: 5000 },
  { name: "Emergency fund", group: "Savings", had: 8000 },
];
const groups = [...new Set(categories.map((c) => c.group))];

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
const opening = (account: string, amount: number): Entry => ({
  kind: "opening",
  id: id(),
  date: "2026-08-01",
  account,
  amount,
});

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
      opening("checking", 1850),
      opening("savings", 6000),
      opening("cash", 120),
      opening("joint", 340),
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
const cents = (n: number) => Math.round(n * 100) / 100 + 0;
const parse = (typed: string) => Number.parseFloat(typed) || 0;
const asDate = (iso: string) => new Date(`${iso}T12:00`);
const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const monthOf = (iso: string) => iso.slice(0, 7);
const monthName = (m: string) => monthFormat.format(asDate(`${m}-01`));
const stateOf = (n: number) =>
  n < 0 ? "overspent" : n === 0 ? "zero" : "available";
const focusOnMount = (el: HTMLElement | null) => el?.focus();

/* ------------------------------------------------------------------ */
/* Reading the records                                                */
/* ------------------------------------------------------------------ */

const without = (d: Data, except?: string) =>
  except ? d.entries.filter((e) => e.id !== except) : d.entries;
function amountFor(e: Entry, account: string) {
  if (e.kind === "transfer") {
    if (e.from === account) return -e.amount;
    if (e.to === account) return e.amount;
    return 0;
  }
  return e.account === account ? e.amount : 0;
}
const touches = (e: Entry, account: string) =>
  e.kind === "transfer"
    ? e.from === account || e.to === account
    : e.account === account;
const balance = (d: Data, account: string, except?: string) =>
  cents(without(d, except).reduce((s, e) => s + amountFor(e, account), 0));
const openAccounts = (d: Data) => d.accounts.filter((a) => !a.closed);
const total = (d: Data) =>
  cents(openAccounts(d).reduce((s, a) => s + balance(d, a.id), 0));
const byId = (d: Data, account: string) => {
  const a = d.accounts.find((x) => x.id === account);
  if (!a) throw new Error(account);
  return a;
};
/** Spending is net: refunds in a Category count against it. */
const spending = (d: Data, category: string, except?: string) =>
  cents(
    without(d, except).reduce(
      (s, e) => (e.kind === "tx" && e.category === category ? s - e.amount : s),
      0,
    ),
  );
const available = (d: Data, category: string, except?: string) => {
  const c = categories.find((x) => x.name === category);
  return cents((c?.had ?? 0) - spending(d, category, except));
};
function readyToAssign(d: Data, except?: string) {
  const came = without(d, except).reduce(
    (s, e) =>
      e.kind === "opening" ||
      e.kind === "adjustment" ||
      (e.kind === "tx" && e.category === null)
        ? s + e.amount
        : s,
    0,
  );
  return cents(came - categories.reduce((s, c) => s + c.had, 0));
}
const newestFirst = (entries: Entry[]) =>
  [...entries]
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
    .reverse();
function describe(d: Data, e: Entry, account?: string) {
  const name = (a: string) => byId(d, a).name;
  switch (e.kind) {
    case "tx":
      return {
        title: e.payee || "No Payee",
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
/** A Transaction or Transfer whose Accounts are all open can change. */
function editable(d: Data, e: Entry) {
  if (e.kind === "tx") return !byId(d, e.account).closed;
  if (e.kind === "transfer")
    return !byId(d, e.from).closed && !byId(d, e.to).closed;
  return false;
}
function knownPayees(d: Data) {
  const seen = new Map<string, Tx>();
  for (const e of newestFirst(d.entries))
    if (e.kind === "tx" && e.payee && !seen.has(e.payee)) seen.set(e.payee, e);
  return [...seen.values()];
}

/* ------------------------------------------------------------------ */
/* The form's state, shared by every surface                          */
/* ------------------------------------------------------------------ */

type Target =
  | { kind: "new"; as: "tx" | "transfer"; from?: string }
  | { kind: "edit"; entry: string }
  | { kind: "read"; entry: string };
type TxDraft = {
  direction: "out" | "in";
  amount: string;
  payee: string;
  date: string;
  account: string;
  category: string | null;
};
type TransferDraft = {
  amount: string;
  from: string;
  to: string;
  date: string;
};
type Act = {
  change(next: Data, text: string, flash?: string): void;
};

function useEntryForm({
  data: d,
  target,
  account,
  act,
  flush,
  onSaved,
  onDeleted,
}: {
  data: Data;
  target: Target;
  account: string;
  act: Act;
  flush?: RefObject<(() => void) | null>;
  onSaved(more: boolean): void;
  onDeleted(): void;
}) {
  const editing =
    target.kind === "edit"
      ? d.entries.find((e) => e.id === target.entry)
      : undefined;
  const [kind, setKind] = useState<"tx" | "transfer">(
    editing?.kind === "transfer" ||
      (target.kind === "new" && target.as === "transfer")
      ? "transfer"
      : "tx",
  );
  const [draft, setDraft] = useState<TxDraft>(() =>
    editing?.kind === "tx"
      ? {
          direction: editing.amount < 0 ? "out" : "in",
          amount: Math.abs(editing.amount).toFixed(2),
          payee: editing.payee,
          date: editing.date,
          account: editing.account,
          category: editing.category,
        }
      : {
          direction: "out",
          amount: "",
          payee: "",
          date: TODAY,
          account,
          category: null,
        },
  );
  const [move, setMove] = useState<TransferDraft>(() => {
    if (editing?.kind === "transfer")
      return {
        amount: editing.amount.toFixed(2),
        from: editing.from,
        to: editing.to,
        date: editing.date,
      };
    const from = target.kind === "new" && target.from ? target.from : account;
    return {
      amount: "",
      from,
      to: openAccounts(d).find((a) => a.id !== from)?.id ?? from,
      date: TODAY,
    };
  });
  const [start] = useState(() => JSON.stringify([draft, move]));
  const dirty = JSON.stringify([draft, move]) !== start;
  const except = editing?.id;
  const valid =
    kind === "tx"
      ? parse(draft.amount) > 0 &&
        (draft.direction === "in" || draft.category !== null)
      : parse(move.amount) > 0 && move.from !== move.to;

  function write() {
    const entryId = editing?.id ?? id();
    const entry: Entry =
      kind === "tx"
        ? {
            kind: "tx",
            id: entryId,
            date: draft.date,
            account: draft.account,
            payee: draft.payee.trim(),
            category: draft.category,
            amount:
              draft.direction === "out"
                ? -parse(draft.amount)
                : parse(draft.amount),
          }
        : {
            kind: "transfer",
            id: entryId,
            date: move.date,
            from: move.from,
            to: move.to,
            amount: parse(move.amount),
          };
    const entries = editing
      ? d.entries.map((e) => (e.id === entryId ? entry : e))
      : [...d.entries, entry];
    const text = editing
      ? "Changes saved"
      : kind === "transfer"
        ? "Transfer made"
        : `Recorded ${signed(entry.amount)}${draft.payee.trim() ? ` at ${draft.payee.trim()}` : ""}`;
    act.change({ ...d, entries }, text, entryId);
  }
  function save(more: boolean) {
    if (!valid) return false;
    write();
    if (!editing) {
      // Date and Account stay: several in a row usually share them.
      setDraft({
        ...draft,
        direction: "out",
        amount: "",
        payee: "",
        category: null,
      });
      setMove({ ...move, amount: "" });
    }
    onSaved(more);
    return true;
  }
  function remove() {
    if (!editing) return;
    act.change(
      { ...d, entries: d.entries.filter((e) => e.id !== editing.id) },
      `Deleted ${describe(d, editing).title}`,
    );
    onDeleted();
  }
  // Leaving a row for another one keeps what was typed: it saves, with Undo.
  useEffect(() => {
    if (!flush) return;
    flush.current = dirty && valid && editing ? write : null;
    return () => {
      flush.current = null;
    };
  });
  return {
    kind,
    setKind,
    draft,
    setDraft,
    move,
    setMove,
    editing,
    except,
    valid,
    dirty,
    save,
    remove,
  };
}
type Form = ReturnType<typeof useEntryForm>;

/** Enter records, or moves to whatever is missing. Esc closes. */
function formKeys(form: Form, onClose: () => void) {
  return (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Enter") return;
    const t = e.target as HTMLElement;
    if (t.tagName !== "INPUT" && t.tagName !== "SELECT") return;
    e.preventDefault();
    if (!form.save(e.shiftKey))
      e.currentTarget.querySelector<HTMLElement>("[data-need='true']")?.focus();
  };
}
function focusNext(from: HTMLElement) {
  const scope = from.closest("[data-form]");
  if (!scope) return;
  const all = [
    ...scope.querySelectorAll<HTMLElement>(
      "input:not([disabled]), select, button:not([disabled])",
    ),
  ];
  all[all.indexOf(from) + 1]?.focus();
}

/* ------------------------------------------------------------------ */
/* Fields                                                             */
/* ------------------------------------------------------------------ */

type Option = { key: string; search: string; node: ReactNode };
function Combo({
  label,
  shown,
  options,
  onPick,
  free,
  onFree,
  inline,
  placeholder,
  need,
  auto,
  onPicked,
}: {
  label: string;
  shown: string;
  options: Option[];
  onPick(key: string): void;
  /** Typing keeps what's typed (a new Payee); options only suggest. */
  free?: boolean;
  onFree?(text: string): void;
  /** The list is always showing, in the flow. */
  inline?: boolean;
  placeholder?: string;
  need?: boolean;
  auto?: boolean;
  onPicked?: (input: HTMLElement) => void;
}) {
  const base = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = (free ? shown : (query ?? "")).toLowerCase();
  const list = free
    ? q
      ? options
          .filter(
            (o) =>
              o.search.toLowerCase().startsWith(q) &&
              o.search.toLowerCase() !== q,
          )
          .slice(0, 5)
      : []
    : options.filter((o) => o.search.toLowerCase().includes(q));
  const showing = (inline || open) && list.length > 0;
  function pick(key: string, input: HTMLElement) {
    onPick(key);
    setQuery(null);
    setOpen(false);
    setActive(-1);
    onPicked?.(input);
  }
  return (
    <div className="rt-field re-combo" data-inline={inline}>
      <label htmlFor={`${base}i`} className="small muted">
        {label}
      </label>
      <input
        id={`${base}i`}
        ref={auto ? focusOnMount : undefined}
        role="combobox"
        aria-expanded={showing}
        aria-controls={`${base}l`}
        aria-autocomplete="list"
        aria-activedescendant={
          showing && active >= 0 ? `${base}o${active}` : undefined
        }
        autoComplete="off"
        data-need={need}
        placeholder={placeholder}
        value={free ? shown : (query ?? (inline ? "" : shown))}
        onFocus={() => !free && setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery(null);
          setActive(-1);
        }}
        onChange={(e) => {
          setOpen(true);
          setActive(free ? -1 : 0);
          if (free) onFree?.(e.target.value);
          else setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            const by = e.key === "ArrowDown" ? 1 : -1;
            setActive(Math.max(0, Math.min(active + by, list.length - 1)));
          } else if (e.key === "Enter" && showing && list[active]) {
            e.preventDefault();
            pick(list[active].key, e.currentTarget);
          } else if (
            e.key === "Tab" &&
            !free &&
            query &&
            showing &&
            list[active]
          ) {
            onPick(list[active].key);
          } else if (e.key === "Escape" && open && !inline) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      <div
        id={`${base}l`}
        role="listbox"
        aria-label={label}
        className="re-pop"
        hidden={!showing}
      >
        {list.map((o, i) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keys are on the input
          <div
            key={o.key}
            tabIndex={-1}
            id={`${base}o${i}`}
            role="option"
            aria-selected={i === active}
            className="re-option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              const input = e.currentTarget
                .closest(".re-combo")
                ?.querySelector("input");
              if (input) pick(o.key, input);
            }}
          >
            {o.node}
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryField({
  data: d,
  form: f,
  inline,
  onPicked,
}: {
  data: Data;
  form: Form;
  inline?: boolean;
  onPicked?: (input: HTMLElement) => void;
}) {
  const { draft: t } = f;
  const delta = t.direction === "out" ? -parse(t.amount) : parse(t.amount);
  const options: Option[] = groups.flatMap((g) =>
    categories
      .filter((c) => c.group === g)
      .map((c) => {
        const now = available(d, c.name, f.except);
        return {
          key: c.name,
          search: c.name,
          node: (
            <>
              <span className="re-option-name">
                {c.name}
                <span className="small muted"> {c.group}</span>
              </span>
              <span className="b-after num small">
                <span className="muted">{money(now)}</span>
                <span className="pill" data-state={stateOf(now + delta)}>
                  {money(cents(now + delta))}
                </span>
              </span>
            </>
          ),
        };
      }),
  );
  if (t.direction === "in")
    options.unshift({
      key: "__rta",
      search: "Ready to Assign",
      node: (
        <>
          <span className="re-option-name">
            <strong>Ready to Assign</strong>
          </span>
          <span className="b-after num small">
            <span className="muted">{money(readyToAssign(d, f.except))}</span>
            <span className="pill" data-state="available">
              {money(cents(readyToAssign(d, f.except) + delta))}
            </span>
          </span>
        </>
      ),
    });
  return (
    <Combo
      label={t.direction === "in" ? "Goes to" : "Category"}
      shown={t.category ?? (t.direction === "in" ? "Ready to Assign" : "")}
      options={options}
      inline={inline}
      placeholder={
        inline
          ? `Find a Category${t.category ? ` (${t.category})` : ""}`
          : "Type to find one"
      }
      need={t.direction === "out" && t.category === null}
      onPick={(key) =>
        f.setDraft({ ...t, category: key === "__rta" ? null : key })
      }
      onPicked={onPicked ?? focusNext}
    />
  );
}

function PayeeField({
  data: d,
  form: f,
  auto,
}: {
  data: Data;
  form: Form;
  auto?: boolean;
}) {
  const { draft: t } = f;
  const known = knownPayees(d);
  const fill = (p: Tx, payee: string): TxDraft => ({
    ...t,
    payee,
    // A known Payee brings its last Category, unless one is chosen (#79).
    category: t.category ?? (t.direction === "out" ? p.category : null),
    account: byId(d, p.account).closed ? t.account : p.account,
  });
  return (
    <Combo
      label="Payee"
      shown={t.payee}
      free
      auto={auto}
      placeholder="Who was it?"
      options={known.map((p) => ({
        key: p.payee,
        search: p.payee,
        node: (
          <span className="re-option-name">
            {p.payee}
            <span className="small muted">
              {" "}
              {p.category ?? "Ready to Assign"}
            </span>
          </span>
        ),
      }))}
      onFree={(text) => {
        const p = known.find(
          (x) => x.payee.toLowerCase() === text.toLowerCase(),
        );
        f.setDraft(p ? fill(p, text) : { ...t, payee: text });
      }}
      onPick={(key) => {
        const p = known.find((x) => x.payee === key);
        if (p) f.setDraft(fill(p, p.payee));
      }}
    />
  );
}

function AmountField({
  form: f,
  big,
  auto,
}: {
  form: Form;
  big?: boolean;
  auto?: boolean;
}) {
  const { draft: t } = f;
  const flip = (direction: "out" | "in") =>
    direction !== t.direction &&
    f.setDraft({ ...t, direction, category: null });
  const input = (
    <input
      ref={auto ? focusOnMount : undefined}
      className={big ? "rt-amount num" : "num"}
      inputMode="decimal"
      placeholder="0.00"
      aria-label="Amount"
      data-first
      data-need={parse(t.amount) <= 0}
      value={t.amount}
      onChange={(e) =>
        f.setDraft({ ...t, amount: e.target.value.replace(/[^\d.]/g, "") })
      }
      onKeyDown={(e) => {
        if (e.key === "+") {
          e.preventDefault();
          flip("in");
        }
        if (e.key === "-") {
          e.preventDefault();
          flip("out");
        }
      }}
    />
  );
  if (big)
    return (
      <div className="stack re-amount-big">
        <Segmented
          label="Money out or in?"
          value={t.direction}
          options={[
            { value: "out", label: "Money out" },
            { value: "in", label: "Money in" },
          ]}
          onChange={flip}
        />
        <div className="b-amount-field" data-direction={t.direction}>
          <span aria-hidden>{t.direction === "out" ? "−$" : "+$"}</span>
          {input}
        </div>
      </div>
    );
  return (
    <div className="rt-field">
      <span className="small muted">Amount</span>
      <span className="re-amount-cell" data-direction={t.direction}>
        <button
          type="button"
          className="re-sign"
          tabIndex={-1}
          aria-label={
            t.direction === "out"
              ? "Money out. Switch to money in"
              : "Money in. Switch to money out"
          }
          onClick={() => flip(t.direction === "out" ? "in" : "out")}
        >
          {t.direction === "out" ? "−" : "+"}
        </button>
        {input}
      </span>
    </div>
  );
}

function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange(date: string): void;
}) {
  const fieldId = useId();
  return (
    <div className="rt-field">
      <label htmlFor={fieldId} className="small muted">
        Date
      </label>
      <input
        id={fieldId}
        type="date"
        value={value}
        max={TODAY}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}

function AccountField({
  data: d,
  value,
  onChange,
  label = "Account",
  except,
}: {
  data: Data;
  value: string;
  onChange(account: string): void;
  label?: string;
  except?: string;
}) {
  const fieldId = useId();
  return (
    <div className="rt-field rt-account">
      <label htmlFor={fieldId} className="small muted">
        {label}
      </label>
      <select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {openAccounts(d).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {money(balance(d, a.id, except))}
          </option>
        ))}
      </select>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <fieldset className="seg" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

function AfterLine({ data: d, form: f }: { data: Data; form: Form }) {
  const { draft: t } = f;
  const delta = t.direction === "out" ? -parse(t.amount) : parse(t.amount);
  if (t.category === null) {
    if (t.direction === "out")
      return (
        <p className="small muted re-after">
          Choose a Category to see what it has left.
        </p>
      );
    return (
      <p className="small re-after split">
        <span>Ready to Assign after this</span>
        <strong className="num">
          {money(cents(readyToAssign(d, f.except) + delta))}
        </strong>
      </p>
    );
  }
  const after = cents(available(d, t.category, f.except) + delta);
  return (
    <p className="small re-after split" aria-live="polite">
      <span>{t.category} after this</span>
      <strong className="num" data-state={stateOf(after)}>
        {after < 0 ? `Overspent by ${money(-after)}` : `${money(after)} left`}
      </strong>
    </p>
  );
}

function TransferFields({
  data: d,
  form: f,
  big,
  auto,
}: {
  data: Data;
  form: Form;
  big?: boolean;
  auto?: boolean;
}) {
  const { move: m } = f;
  const amount = parse(m.amount);
  const same = m.from === m.to;
  return (
    <>
      <div className={big ? "b-amount-field" : "rt-field"}>
        <span className={big ? undefined : "small muted"}>
          {big ? "$" : "Amount"}
        </span>
        <input
          ref={auto ? focusOnMount : undefined}
          className={big ? "rt-amount num" : "num"}
          aria-label="Amount"
          inputMode="decimal"
          placeholder="0.00"
          data-first
          data-need={amount <= 0}
          value={m.amount}
          onChange={(e) =>
            f.setMove({ ...m, amount: e.target.value.replace(/[^\d.]/g, "") })
          }
        />
      </div>
      <AccountField
        data={d}
        label="From"
        value={m.from}
        except={f.except}
        onChange={(from) => f.setMove({ ...m, from })}
      />
      <AccountField
        data={d}
        label="To"
        value={m.to}
        except={f.except}
        onChange={(to) => f.setMove({ ...m, to })}
      />
      <DateField
        value={m.date}
        onChange={(date) => f.setMove({ ...m, date })}
      />
      <p className="small muted re-after re-span">
        {same
          ? "Choose two different Accounts."
          : `${byId(d, m.from).name} goes to ${money(cents(balance(d, m.from, f.except) - amount))}, ${byId(d, m.to).name} to ${money(cents(balance(d, m.to, f.except) + amount))}. Categories and Ready to Assign don't change.`}
      </p>
    </>
  );
}

const kbd = (keys: string) => <kbd className="re-kbd">{keys}</kbd>;

/** What a row that can't be edited says, and how a read-first sheet reads. */
function ReadOnly({
  data: d,
  entry: e,
  act,
  onEdit,
  onClose,
}: {
  data: Data;
  entry: Entry;
  act: Act;
  onEdit?: () => void;
  onClose(): void;
}) {
  const x = describe(d, e);
  const stuck =
    (e.kind === "tx" || e.kind === "transfer") && !editable(d, e)
      ? d.accounts.filter((a) => a.closed && touches(e, a.id))[0]
      : undefined;
  return (
    <div className="stack">
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
            <dd>{e.kind === "tx" ? x.sub : "Ready to Assign"}</dd>
          </div>
          {e.kind === "tx" && e.category && (
            <div>
              <dt className="muted">{e.category} has now</dt>
              <dd className="num">{money(available(d, e.category))}</dd>
            </div>
          )}
        </dl>
      )}
      {e.kind === "adjustment" && (
        <p className="small muted">
          You told budjet {byId(d, e.account).name} held {money(e.declared)}
          {e.amount !== 0 &&
            `, so the difference went ${e.amount < 0 ? "out of" : "into"} Ready to Assign`}
          .
        </p>
      )}
      {e.kind === "opening" && (
        <p className="small muted">
          What {byId(d, e.account).name} held when you added it.
        </p>
      )}
      {stuck && (
        <p className="small muted">
          {stuck.name} is closed, so this stays as it is.
        </p>
      )}
      <div className="rt-save">
        {e.kind !== "opening" && !stuck && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              act.change(
                { ...d, entries: d.entries.filter((y) => y.id !== e.id) },
                `Deleted ${x.title}`,
              );
              onClose();
            }}
          >
            Delete
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            className="btn btn-primary rt-save-main"
            ref={focusOnMount}
            onClick={onEdit}
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

type SurfaceProps = {
  data: Data;
  target: Target;
  account: string;
  act: Act;
  flush: RefObject<(() => void) | null>;
  onClose(): void;
};
function titleFor(f: Form) {
  if (f.editing)
    return f.kind === "transfer" ? "Edit Transfer" : "Edit Transaction";
  return "Record";
}
function KindSwitch({ form: f }: { form: Form }) {
  if (f.editing) return null;
  return (
    <Segmented<"tx" | "transfer">
      label="What to record"
      value={f.kind}
      options={[
        { value: "tx", label: "Transaction" },
        { value: "transfer", label: "Transfer" },
      ]}
      onChange={f.setKind}
    />
  );
}

/* ------------------------------------------------------------------ */
/* A. Dialog: every field on one page, over the screen.               */
/* ------------------------------------------------------------------ */

function DialogA(props: SurfaceProps) {
  const { data: d, target, onClose } = props;
  const [count, setCount] = useState(0);
  const scope = useRef<HTMLDivElement>(null);
  const f = useEntryForm({
    ...props,
    onSaved(more) {
      if (!more) return onClose();
      setCount(count + 1);
      scope.current?.querySelector<HTMLElement>("[data-first]")?.focus();
    },
    onDeleted: onClose,
  });
  const read =
    target.kind === "read"
      ? d.entries.find((e) => e.id === target.entry)
      : undefined;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the scrim closes on a click
    <div
      className="ac-scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={scope}
        className="ac-dialog re-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={read ? describe(d, read).title : titleFor(f)}
        data-form
        onKeyDown={formKeys(f, onClose)}
      >
        <div className="rt-head">
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
          <h2 className="rt-title">
            {read ? describe(d, read).title : titleFor(f)}
          </h2>
        </div>
        {read ? (
          <div className="rt-body re-body">
            <ReadOnly data={d} entry={read} act={props.act} onClose={onClose} />
          </div>
        ) : (
          <>
            <div className="rt-body re-body">
              <KindSwitch form={f} />
              {f.kind === "tx" ? (
                <>
                  <AmountField form={f} big auto />
                  <CategoryField data={d} form={f} />
                  <AfterLine data={d} form={f} />
                  <PayeeField data={d} form={f} />
                  <div className="re-two">
                    <DateField
                      value={f.draft.date}
                      onChange={(date) => f.setDraft({ ...f.draft, date })}
                    />
                    <AccountField
                      data={d}
                      value={f.draft.account}
                      except={f.except}
                      onChange={(account) =>
                        f.setDraft({ ...f.draft, account })
                      }
                    />
                  </div>
                </>
              ) : (
                <TransferFields data={d} form={f} big auto />
              )}
              {count > 0 && (
                <p className="small muted">{count} recorded so far.</p>
              )}
            </div>
            <div className="rt-foot rt-save">
              {f.editing ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={f.remove}
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!f.valid}
                  onClick={() => f.save(true)}
                >
                  Record and add another {kbd("⇧↵")}
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary rt-save-main"
                disabled={!f.valid}
                onClick={() => f.save(false)}
              >
                {f.editing ? "Save changes" : "Record"} {kbd("↵")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* B. Side panel: takes the right column. The page stays live.        */
/* ------------------------------------------------------------------ */

function PanelB(props: SurfaceProps) {
  const { data: d, target, onClose } = props;
  const scope = useRef<HTMLElement>(null);
  const f = useEntryForm({
    ...props,
    onSaved() {
      scope.current?.querySelector<HTMLElement>("[data-first]")?.focus();
    },
    onDeleted: onClose,
  });
  const read =
    target.kind === "read"
      ? d.entries.find((e) => e.id === target.entry)
      : undefined;
  return (
    <aside
      ref={scope}
      className="re-panel"
      aria-label={read ? describe(d, read).title : titleFor(f)}
      data-form
      onKeyDown={formKeys(f, onClose)}
    >
      <div className="re-panel-head">
        <h2 className="rt-title">
          {read ? describe(d, read).title : titleFor(f)}
        </h2>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </div>
      {read ? (
        <div className="rt-body re-body">
          <ReadOnly data={d} entry={read} act={props.act} onClose={onClose} />
        </div>
      ) : (
        <>
          <div className="rt-body re-body">
            <KindSwitch form={f} />
            {f.kind === "tx" ? (
              <>
                <AmountField form={f} big auto={!f.editing} />
                <PayeeField data={d} form={f} />
                <div className="re-two">
                  <DateField
                    value={f.draft.date}
                    onChange={(date) => f.setDraft({ ...f.draft, date })}
                  />
                  <AccountField
                    data={d}
                    value={f.draft.account}
                    except={f.except}
                    onChange={(account) => f.setDraft({ ...f.draft, account })}
                  />
                </div>
                <AfterLine data={d} form={f} />
                <CategoryField
                  data={d}
                  form={f}
                  inline
                  onPicked={(input) =>
                    // Next frame: Record only enables once the pick lands.
                    requestAnimationFrame(() =>
                      input
                        .closest("[data-form]")
                        ?.querySelector<HTMLElement>(".re-panel-main")
                        ?.focus(),
                    )
                  }
                />
              </>
            ) : (
              <TransferFields data={d} form={f} big auto={!f.editing} />
            )}
          </div>
          <div className="rt-foot rt-save">
            {f.editing && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={f.remove}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary rt-save-main re-panel-main"
              disabled={!f.valid}
              onClick={() => f.save(true)}
            >
              {f.editing ? "Save changes" : "Record"} {kbd("↵")}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* C. In the list: an editable row, on desktop and phone.             */
/* ------------------------------------------------------------------ */

function RowC({ back, ...props }: SurfaceProps & { back?: () => void }) {
  const { data: d, onClose } = props;
  const scope = useRef<HTMLDivElement>(null);
  const f = useEntryForm({
    ...props,
    onSaved() {
      if (f.editing) return onClose();
      scope.current?.querySelector<HTMLElement>("input")?.focus();
    },
    onDeleted: onClose,
  });
  const isNew = !f.editing;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: form keys bubble here
    <div
      ref={scope}
      className="card re-row"
      data-new={isNew}
      data-form
      onKeyDown={formKeys(f, onClose)}
    >
      {isNew && (
        <div className="re-row-head">
          {back && (
            <button type="button" className="link small" onClick={back}>
              ‹ Back to Budget
            </button>
          )}
          <KindSwitch form={f} />
        </div>
      )}
      <div className="re-cells" data-kind={f.kind}>
        {f.kind === "tx" ? (
          <>
            <PayeeField data={d} form={f} auto />
            <CategoryField data={d} form={f} />
            <AmountField form={f} />
            <DateField
              value={f.draft.date}
              onChange={(date) => f.setDraft({ ...f.draft, date })}
            />
            <AccountField
              data={d}
              value={f.draft.account}
              except={f.except}
              onChange={(account) => f.setDraft({ ...f.draft, account })}
            />
          </>
        ) : (
          <TransferFields data={d} form={f} auto />
        )}
      </div>
      <div className="re-row-foot">
        {f.kind === "tx" ? <AfterLine data={d} form={f} /> : <span />}
        <div className="row-gap">
          {f.editing && (
            <button type="button" className="btn btn-danger" onClick={f.remove}>
              Delete
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {f.editing ? "Cancel" : "Done"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!f.valid}
            onClick={() => f.save(true)}
          >
            {f.editing ? "Save changes" : "Record"} {kbd("↵")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The phone's sheets: the review screen from #79, reached from a row */
/* ------------------------------------------------------------------ */

function PhoneEdit(props: SurfaceProps) {
  const { data: d, onClose } = props;
  const [step, setStep] = useState<"review" | "amount" | "category">("review");
  const f = useEntryForm({
    ...props,
    onSaved: onClose,
    onDeleted: onClose,
  });
  const t = f.draft;
  const delta = t.direction === "out" ? -parse(t.amount) : parse(t.amount);
  let body: ReactNode;
  if (f.kind === "transfer") {
    body = (
      <div className="rt-body">
        <TransferFields data={d} form={f} big />
      </div>
    );
  } else if (step === "amount") {
    body = (
      <div className="rt-body">
        <AmountField form={f} big auto />
        <button
          type="button"
          className="btn btn-primary btn-wide"
          disabled={parse(t.amount) <= 0}
          onClick={() => setStep("review")}
        >
          Done
        </button>
      </div>
    );
  } else if (step === "category") {
    body = (
      <div className="rt-body">
        <CategoryField
          data={d}
          form={f}
          inline
          onPicked={() => setStep("review")}
        />
      </div>
    );
  } else {
    body = (
      <div className="rt-body">
        <div className="card b-summary">
          <button
            type="button"
            className="b-summary-line"
            onClick={() => setStep("amount")}
          >
            <span className="muted small">
              {t.direction === "out" ? "Money out" : "Money in"}
            </span>
            <span
              className="rt-amount b-summary-amount num"
              data-direction={t.direction}
            >
              {signed(delta)}
            </span>
          </button>
          <button
            type="button"
            className="b-summary-line"
            onClick={() => setStep("category")}
          >
            <span className="muted small">
              {t.direction === "in" ? "Goes to" : "Category"}
            </span>
            <span className="b-summary-cat">
              {t.category ?? (t.direction === "in" ? "Ready to Assign" : "")}
            </span>
          </button>
          <AfterLine data={d} form={f} />
        </div>
        <PayeeField data={d} form={f} />
        <DateField
          value={t.date}
          onChange={(date) => f.setDraft({ ...t, date })}
        />
        <AccountField
          data={d}
          value={t.account}
          except={f.except}
          onChange={(account) => f.setDraft({ ...t, account })}
        />
      </div>
    );
  }
  return (
    <div className="rt-scrim">
      <div
        className="rt-sheet"
        data-full="true"
        role="dialog"
        aria-modal="true"
        aria-label={titleFor(f)}
        data-form
      >
        <div className="rt-head">
          <button
            type="button"
            className="link"
            onClick={step === "review" ? onClose : () => setStep("review")}
          >
            {step === "review" ? "Close" : "Back"}
          </button>
          <h2 className="rt-title">
            {f.editing ? titleFor(f) : "Make a Transfer"}
          </h2>
        </div>
        {body}
        {step === "review" && (
          <div className="rt-foot rt-save">
            {f.editing && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={f.remove}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary rt-save-main"
              disabled={!f.valid}
              onClick={() => f.save(false)}
            >
              {f.editing ? "Save changes" : "Transfer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PhoneRead({
  data: d,
  entry: e,
  act,
  onEdit,
  onClose,
}: {
  data: Data;
  entry: Entry;
  act: Act;
  onEdit?: () => void;
  onClose(): void;
}) {
  return (
    <div className="rt-scrim">
      <div
        className="rt-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={describe(d, e).title}
      >
        <div className="rt-head">
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
          <h2 className="rt-title">{describe(d, e).title}</h2>
        </div>
        <div className="rt-body">
          <ReadOnly
            data={d}
            entry={e}
            act={act}
            onEdit={onEdit}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The shell                                                          */
/* ------------------------------------------------------------------ */

type Ui = {
  wide: boolean;
  /** The right column is the panel's: leave it out. */
  narrow: boolean;
  go(place: string): void;
  record(as?: "tx" | "transfer", from?: string): void;
  open(entry: string): void;
  selected?: string;
  flash?: string;
  /** What replaces a row in the list, in C. */
  inline(entry: string): ReactNode;
  /** The new row above the history, in C. */
  top: ReactNode;
  act: Act;
};

export function RecordDesktopPrototype() {
  const [variantParam, setVariant] = useUrlParameter("recd");
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
  const [target, setTarget] = useState<Target | null>(null);
  const [fromBudget, setFromBudget] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: Data } | null>(
    null,
  );
  const [flash, setFlash] = useState<string>();
  const [run, setRun] = useState(0);
  const [lastAccount, setLastAccount] = useState("checking");
  const flush = useRef<(() => void) | null>(null);

  const known = data.accounts.some((a) => a.id === placeParam);
  const place =
    placeParam === "activity" ||
    placeParam === "budget" ||
    placeParam === "accounts" ||
    known
      ? (placeParam as string)
      : "budget";
  const account = known && !byId(data, place).closed ? place : lastAccount;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  function cycle(by: number) {
    const i = variantKeys.indexOf(key);
    setTarget(null);
    setVariant(
      variantKeys[(i + by + variantKeys.length) % variantKeys.length],
      "replace",
    );
  }
  function record(as: "tx" | "transfer" = "tx", from?: string) {
    flush.current?.();
    if (known) setLastAccount(account);
    // In C the row lives above a history, and the Budget has none.
    if (key === "C" && (place === "budget" || place === "accounts")) {
      setFromBudget(place === "budget");
      setPlace("activity", "push");
    }
    setTarget({ kind: "new", as, from });
  }
  function open(entry: string) {
    flush.current?.();
    const e = data.entries.find((x) => x.id === entry);
    if (!e) return;
    const can = editable(data, e);
    if (!can) return setTarget({ kind: "read", entry });
    setTarget({ kind: !wide && key === "B" ? "read" : "edit", entry });
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (wide && event.altKey && event.code === "KeyN") {
        event.preventDefault();
        record();
        return;
      }
      const t = event.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("[aria-modal='true']")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const act: Act = {
    change(next, text, flashed) {
      setToast({ text, undo: data });
      setData(next);
      setFlash(flashed);
    },
  };
  const close = () => {
    setTarget(null);
    setFromBudget(false);
  };
  const surface = (t: Target): SurfaceProps => ({
    data,
    target: t,
    account,
    act,
    flush,
    onClose: close,
  });
  const targetKey = (t: Target) =>
    t.kind === "new" ? `new-${t.as}-${t.from ?? ""}` : `${t.kind}-${t.entry}`;
  const targetEntry =
    target && target.kind !== "new"
      ? data.entries.find((e) => e.id === target.entry)
      : undefined;
  // Undo can take away the row being looked at.
  const live = target && (target.kind === "new" || targetEntry) ? target : null;

  const isPanel = wide && key === "B" && live !== null;
  const ui: Ui = {
    wide,
    narrow: isPanel,
    go: (to) => {
      setFromBudget(false);
      setPlace(to, "push");
    },
    record,
    open,
    selected: targetEntry?.id,
    flash,
    inline(entry) {
      if (key !== "C" || !live || live.kind === "new") return null;
      if (live.entry !== entry || !targetEntry) return null;
      if (live.kind === "read")
        return (
          <div className="re-row-read">
            <ReadOnly
              data={data}
              entry={targetEntry}
              act={act}
              onClose={close}
            />
            <button type="button" className="btn btn-quiet" onClick={close}>
              Close
            </button>
          </div>
        );
      return <RowC key={targetKey(live)} {...surface(live)} />;
    },
    top:
      key === "C" && live?.kind === "new" ? (
        <RowC
          key={`${targetKey(live)}-${run}`}
          {...surface(live)}
          back={
            fromBudget
              ? () => {
                  close();
                  setPlace("budget", "push");
                }
              : undefined
          }
        />
      ) : null,
    act,
  };

  let overlay: ReactNode = null;
  if (live && key === "A" && wide)
    overlay = <DialogA key={targetKey(live)} {...surface(live)} />;
  if (live && key !== "C" && !wide) {
    overlay =
      live.kind === "read" && targetEntry ? (
        <PhoneRead
          data={data}
          entry={targetEntry}
          act={act}
          onClose={close}
          onEdit={
            editable(data, targetEntry)
              ? () => setTarget({ kind: "edit", entry: targetEntry.id })
              : undefined
          }
        />
      ) : (
        <PhoneEdit key={targetKey(live)} {...surface(live)} />
      );
  }
  if (live && key === "C" && !wide && live.kind === "new")
    overlay = <PhoneEdit key={targetKey(live)} {...surface(live)} />;
  const toastView = toast && (
    <div className="rt-toast ac-toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          type="button"
          className="rt-toast-undo"
          onClick={() => {
            if (toast.undo) setData(toast.undo);
            setToast(null);
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
  const view = (
    <PlaceView
      key={`${key}-${frame}-${run}`}
      data={data}
      place={place}
      ui={ui}
    />
  );

  return (
    <div className="bs rt ac re" data-scheme={scheme} data-frame={frame}>
      {wide ? (
        <div className="bs-desktop" data-panel={isPanel}>
          <Rail data={data} place={place} ui={ui} />
          <main className="bs-main">{view}</main>
          {isPanel && live && (
            <PanelB key={targetKey(live)} {...surface(live)} />
          )}
          {overlay}
          {toastView}
        </div>
      ) : (
        <div className="bs-device">
          <div className="bs-phone">
            {view}
            <TabBar
              place={place}
              go={ui.go}
              onRecord={() =>
                setToast({
                  text: "(+) is settled by #79. Tap a row to try editing.",
                })
              }
            />
            {overlay}
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
          <span className="num">RTA {money(readyToAssign(data))}</span>
          <select
            value={frame}
            onChange={(e) => {
              setTarget(null);
              setFrame(e.target.value, "replace");
            }}
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
              setTarget(null);
              setToast(null);
              setFlash(undefined);
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
/* The screens already settled, trimmed to what this question needs   */
/* ------------------------------------------------------------------ */

function PlaceView({
  data: d,
  place,
  ui,
}: {
  data: Data;
  place: string;
  ui: Ui;
}) {
  if (place === "budget") return <BudgetView data={d} ui={ui} />;
  if (place === "accounts") return <AccountsList data={d} ui={ui} />;
  if (place === "activity")
    return (
      <div className="stack">
        <header className="header">
          <h1 className="title">{ui.wide ? "All Accounts" : "Activity"}</h1>
        </header>
        {ui.top}
        <Statements data={d} entries={d.entries} ui={ui} />
      </div>
    );
  return <AccountPage data={d} account={place} ui={ui} />;
}

function BudgetView({ data: d, ui }: { data: Data; ui: Ui }) {
  const spent = categories.reduce(
    (s, c) =>
      s +
      d.entries.reduce(
        (n, e) =>
          e.kind === "tx" &&
          e.category === c.name &&
          monthOf(e.date) === monthOf(TODAY)
            ? n - e.amount
            : n,
        0,
      ),
    0,
  );
  const summary = (
    <div className="stack">
      <section className="hero ac-hero">
        <p className="hero-muted">Ready to Assign</p>
        <p className="display num">{money(readyToAssign(d))}</p>
      </section>
      <section className="card ac-check">
        <p className="muted small">Spent this Month</p>
        <p className="ac-balance num">{money(cents(spent))}</p>
      </section>
    </div>
  );
  const table = groups.map((g) => (
    <section key={g} className="a-group card">
      <div className="group-head">
        <h2>{g}</h2>
      </div>
      <ul>
        {categories
          .filter((c) => c.group === g)
          .map((c) => {
            const left = available(d, c.name);
            return (
              <li key={c.name} className="re-brow" data-state={stateOf(left)}>
                <span className="a-tname">
                  <Tile name={c.name} />
                  <span className="a-name">{c.name}</span>
                </span>
                <span className="num muted re-bspent">
                  {money(spending(d, c.name))}
                </span>
                <span className="pill num" data-state={stateOf(left)}>
                  {money(left)}
                </span>
              </li>
            );
          })}
      </ul>
    </section>
  ));
  return (
    <div className="stack">
      <header className="header">
        <h1 className="title">October</h1>
      </header>
      {ui.wide && !ui.narrow ? (
        <div className="a-columns">
          <aside className="a-summary">{summary}</aside>
          <div className="a-table">{table}</div>
        </div>
      ) : (
        <>
          {!ui.wide && summary}
          <div className="a-table">{table}</div>
        </>
      )}
    </div>
  );
}

function AccountsList({ data: d, ui }: { data: Data; ui: Ui }) {
  return (
    <div className="stack">
      <header className="header">
        <h1 className="title">Accounts</h1>
      </header>
      <section className="hero ac-hero">
        <p className="hero-muted">Money in your Accounts</p>
        <p className="display num">{money(total(d))}</p>
      </section>
      {d.accounts.map((a) => (
        <section key={a.id} className="card ac-bcard">
          <button
            type="button"
            className="ac-bcard-open"
            onClick={() => ui.go(a.id)}
          >
            <span className="ac-bcard-name">
              {a.name}
              {a.closed && <span className="small muted"> Closed</span>}
            </span>
            <span className="ac-bcard-amount num">
              {money(balance(d, a.id))}
            </span>
          </button>
        </section>
      ))}
    </div>
  );
}

function AccountPage({
  data: d,
  account,
  ui,
}: {
  data: Data;
  account: string;
  ui: Ui;
}) {
  const a = byId(d, account);
  const side = (
    <div className="stack">
      <section className="hero ac-hero">
        <p className="hero-muted">{kindNames[a.kind]}</p>
        <p className="display num">{money(balance(d, a.id))}</p>
      </section>
      {a.closed ? (
        <p className="card ac-note muted">
          Closed. Its history stays here, and it takes no new Transactions or
          Transfers.
        </p>
      ) : (
        <>
          <section className="card ac-check">
            <p>Does {money(balance(d, a.id))} match what your bank says?</p>
            <p className="small muted">The check is settled by #82.</p>
          </section>
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={() => ui.record("transfer", a.id)}
          >
            Transfer money
          </button>
        </>
      )}
    </div>
  );
  const head = (
    <header className="header">
      {!ui.wide && (
        <button
          type="button"
          className="link"
          onClick={() => ui.go("accounts")}
          aria-label="Accounts"
        >
          ‹
        </button>
      )}
      <h1 className="title">{a.name}</h1>
    </header>
  );
  const history = (
    <Statements
      data={d}
      entries={d.entries.filter((e) => touches(e, a.id))}
      account={a.id}
      ui={ui}
    />
  );
  if (!ui.wide)
    return (
      <div className="stack">
        {head}
        {side}
        {history}
      </div>
    );
  if (ui.narrow)
    return (
      <div className="stack">
        {head}
        {history}
      </div>
    );
  return (
    <div>
      {head}
      <div className="ac-b-columns">
        <div className="stack">
          {ui.top}
          {history}
        </div>
        <aside className="ac-b-side">{side}</aside>
      </div>
    </div>
  );
}

function Statements({
  data: d,
  entries,
  account,
  ui,
}: {
  data: Data;
  entries: Entry[];
  account?: string;
  ui: Ui;
}) {
  const rows = newestFirst(entries);
  const ms = [...new Set(rows.map((e) => monthOf(e.date)))];
  return (
    <>
      {ms.map((m, i) => {
        const inMonth = rows.filter((e) => monthOf(e.date) === m);
        const flows = inMonth.map((e) =>
          account
            ? amountFor(e, account)
            : e.kind === "transfer"
              ? 0
              : e.amount,
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
              </span>
            </summary>
            <ul className="card">
              {inMonth.map((e) => (
                <li key={e.id} className="ac-li">
                  {ui.inline(e.id) ?? (
                    <EntryRow data={d} entry={e} account={account} ui={ui} />
                  )}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </>
  );
}

function EntryRow({
  data: d,
  entry: e,
  account,
  ui,
}: {
  data: Data;
  entry: Entry;
  account?: string;
  ui: Ui;
}) {
  const x = describe(d, e, account);
  const place =
    e.kind === "transfer" ? null : account ? null : byId(d, e.account).name;
  return (
    <button
      type="button"
      className="ac-row"
      data-selected={ui.selected === e.id}
      data-flash={ui.flash === e.id}
      onClick={() => ui.open(e.id)}
    >
      <EntryTile entry={e} />
      <span className="ac-row-name">
        <span>{x.title}</span>
        <span className="small muted">
          {place ? `${x.sub}, ${place}` : x.sub}
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
      </span>
    </button>
  );
}

function Rail({ data: d, place, ui }: { data: Data; place: string; ui: Ui }) {
  const link = (to: string, label: ReactNode, extra?: string) => (
    <a
      key={to}
      className={`rail-item ${extra ?? ""}`}
      aria-current={place === to ? "page" : undefined}
      href={`?place=${to}`}
      onClick={(e) => {
        e.preventDefault();
        ui.go(to);
      }}
    >
      {label}
    </a>
  );
  return (
    <nav className="rail" aria-label="Places">
      <button
        type="button"
        className="btn btn-primary btn-wide re-record"
        onClick={() => ui.record()}
      >
        <Plus /> Record {kbd("Alt N")}
      </button>
      {link("budget", <span>Budget</span>)}
      <p className="rail-head muted small">Accounts</p>
      {link(
        "activity",
        <>
          <span>All Accounts</span>
          <span className="num muted small">{money(total(d))}</span>
        </>,
      )}
      {d.accounts.map((a) =>
        link(
          a.id,
          <>
            <span className={a.closed ? "muted" : undefined}>{a.name}</span>
            <span className="num muted small">{money(balance(d, a.id))}</span>
          </>,
          "rail-account",
        ),
      )}
    </nav>
  );
}

function TabBar({
  place,
  go,
  onRecord,
}: {
  place: string;
  go(p: string): void;
  onRecord(): void;
}) {
  const tab = (to: string, label: string, d: string, current: boolean) => (
    <button
      type="button"
      className="tab ac-tab"
      aria-current={current ? "page" : undefined}
      onClick={() => go(to)}
    >
      <TabIcon d={d} />
      {label}
    </button>
  );
  return (
    <nav className="tabs" aria-label="Places">
      {tab("budget", "Budget", "M4 5h14M4 11h9M4 17h11", place === "budget")}
      {tab(
        "activity",
        "Activity",
        "M3 12h4l3-7 4 14 3-7h3",
        place === "activity",
      )}
      <button
        type="button"
        className="record"
        aria-label="Record"
        onClick={onRecord}
      >
        <Plus />
      </button>
      {tab(
        "accounts",
        "Accounts",
        "M3 8h16v10H3zM3 8l3-4h10l3 4M14 13h2",
        place !== "budget" && place !== "activity",
      )}
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
          : (e.payee[0] ?? "·");
  return (
    <span className="tile" data-kind={e.kind} aria-hidden>
      {glyph}
    </span>
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
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
