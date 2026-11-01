// PROTOTYPE (prototype/record-transaction): throwaway. Three ways to record a
// Transaction on a phone for "How does the user record a Transaction on a
// phone?" (#79), switchable via `?record=A|B|C`. Each variant owns everything
// from tapping (+) to saving: how (+) offers a Transaction or a Transfer, the
// amount, money in or out, Payee, date, Account and Category, and the
// Category's Available after this Transaction. Tap a row on Activity to edit
// or delete one. `?scheme=system|dark|light`. Everything is in memory; reload
// to start over.
import "@fontsource-variable/geist";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useUrlParameter } from "../url-parameter";
import "../budget-screen-prototype/prototype.css";
import "./record.css";

type Category = {
  id: string;
  name: string;
  group: string;
  /** Carried forward plus this Month's Assignment. */
  had: number;
  /** Spending before the Transactions listed on Activity. */
  spent: number;
};
type Account = { id: string; name: string; opening: number };
type Transaction = {
  kind: "transaction";
  id: string;
  /** Negative for money out, positive for money in. */
  amount: number;
  payee: string;
  date: string;
  accountId: string;
  /** Null for money in to Ready to Assign. */
  categoryId: string | null;
};
type Transfer = {
  kind: "transfer";
  id: string;
  amount: number;
  fromId: string;
  toId: string;
  date: string;
};
type Entry = Transaction | Transfer;

const variantKeys = ["A", "B", "C"] as const;
type VariantKey = (typeof variantKeys)[number];
const variantNames: Record<VariantKey, string> = {
  A: "Keypad sheet",
  B: "One thing at a time",
  C: "Category first",
};

const TODAY = "2026-10-22";
const YESTERDAY = "2026-10-21";

const cat = (
  group: string,
  name: string,
  had: number,
  spent: number,
): Category => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  group,
  had,
  spent,
});
const categories: Category[] = [
  cat("Bills", "Rent", 1400, 1400),
  cat("Bills", "Electricity", 90, 62.18),
  cat("Bills", "Internet", 55, 0),
  cat("Bills", "Phone", 40, 40),
  cat("Everyday", "Groceries", 600, 348.22),
  cat("Everyday", "Dining out", 300, 233.7),
  cat("Everyday", "Transport", 180, 96),
  cat("Everyday", "Shopping", 250, 287.99),
  cat("Life", "Fun", 200, 64),
  cat("Life", "Gifts", 0, 25.99),
  cat("Life", "Subscriptions", 45, 29.51),
  cat("Savings", "Emergency fund", 5330, 0),
  cat("Savings", "Holiday", 800, 0),
];
const groups = [...new Set(categories.map((x) => x.group))];
const categoryById = (id: string | null) => categories.find((x) => x.id === id);

const accounts: Account[] = [
  { id: "checking", name: "Checking", opening: 2104.98 },
  { id: "savings", name: "Savings", opening: 5930 },
  { id: "cash", name: "Cash", opening: 120 },
];
const accountName = (id: string) =>
  accounts.find((a) => a.id === id)?.name ?? id;

/** Ready to Assign before the Transactions listed on Activity. */
const BASE_READY_TO_ASSIGN = -2160;

const seed: Entry[] = [
  txn("t1", -64.18, "Trader Joe’s", TODAY, "groceries"),
  txn("t2", -42.3, "Corner Bistro", TODAY, "dining-out"),
  txn("t3", -15.49, "Streaming service", YESTERDAY, "subscriptions"),
  txn("t4", 19.99, "Amazon", "2026-10-20", "shopping"),
  {
    kind: "transfer",
    id: "t5",
    amount: 200,
    fromId: "checking",
    toId: "savings",
    date: "2026-10-18",
  },
  txn("t6", 2400, "Acme Payroll", "2026-10-15", null),
];

function txn(
  id: string,
  amount: number,
  payee: string,
  date: string,
  categoryId: string | null,
): Transaction {
  return {
    kind: "transaction",
    id,
    amount,
    payee,
    date,
    accountId: "checking",
    categoryId,
  };
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => usd.format(n).replace("-", "−");
const signed = (n: number) => (n > 0 ? `+${money(n)}` : money(n));
const day = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
function dayName(date: string) {
  if (date === TODAY) return "Today";
  if (date === YESTERDAY) return "Yesterday";
  return day.format(new Date(`${date}T12:00`));
}
/** The typed amount, "18.5", as a number. */
const parse = (typed: string) => Number.parseFloat(typed) || 0;
const typedFrom = (n: number) =>
  n === 0 ? "" : String(Math.abs(n)).replace(/\.(\d)$/, ".$10");

/* ------------------------------------------------------------------ */
/* The Budget the sheet records into                                  */
/* ------------------------------------------------------------------ */

type World = {
  entries: Entry[];
  /** Leaving out the Entry with id `except`, which is being edited. */
  available(categoryId: string, except?: string): number;
  readyToAssign(except?: string): number;
  balance(accountId: string, except?: string): number;
  /** Each Payee once, most recent first, with where it last went. */
  payees: { name: string; categoryId: string | null; accountId: string }[];
};

function worldOf(entries: Entry[]): World {
  const transactions = (except?: string) =>
    entries.filter(
      (e): e is Transaction => e.kind === "transaction" && e.id !== except,
    );
  const payees: World["payees"] = [];
  for (const t of [...transactions()].sort((a, b) =>
    b.date.localeCompare(a.date),
  )) {
    if (t.payee && !payees.some((p) => p.name === t.payee))
      payees.push({
        name: t.payee,
        categoryId: t.categoryId,
        accountId: t.accountId,
      });
  }
  return {
    entries,
    available(categoryId, except) {
      const x = categoryById(categoryId);
      if (!x) return 0;
      return (
        x.had -
        x.spent +
        transactions(except)
          .filter((t) => t.categoryId === categoryId)
          .reduce((s, t) => s + t.amount, 0)
      );
    },
    readyToAssign(except) {
      return (
        BASE_READY_TO_ASSIGN +
        transactions(except)
          .filter((t) => t.categoryId === null)
          .reduce((s, t) => s + t.amount, 0)
      );
    },
    balance(accountId, except) {
      const opening = accounts.find((a) => a.id === accountId)?.opening ?? 0;
      return entries
        .filter((e) => e.id !== except)
        .reduce((s, e) => {
          if (e.kind === "transaction")
            return e.accountId === accountId ? s + e.amount : s;
          if (e.fromId === accountId) return s - e.amount;
          if (e.toId === accountId) return s + e.amount;
          return s;
        }, opening);
    },
    payees,
  };
}

type RecorderProps = {
  world: World;
  /** The Entry tapped on Activity, or null when (+) was tapped. */
  editing: Entry | null;
  onClose(): void;
  onSave(entry: Entry): void;
  onDelete(entry: Entry): void;
};

type Toast = { text: string; undo?: Entry[] };

export function RecordPrototype() {
  const [variantParam, setVariant] = useUrlParameter("record");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const key: VariantKey =
    variantKeys.find((k) => k === variantParam) ?? variantKeys[0];
  const scheme = schemeParam ?? "dark";

  const [entries, setEntries] = useState<Entry[]>(seed);
  const [tab, setTab] = useState<"budget" | "activity">("budget");
  const [sheet, setSheet] = useState<{ editing: Entry | null } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const world = worldOf(entries);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  function cycle(by: number) {
    const i = variantKeys.indexOf(key);
    setSheet(null);
    setVariant(
      variantKeys[(i + by + variantKeys.length) % variantKeys.length],
      "replace",
    );
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (sheet) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function save(entry: Entry) {
    const isEdit = entries.some((e) => e.id === entry.id);
    setEntries(
      isEdit
        ? entries.map((e) => (e.id === entry.id ? entry : e))
        : [entry, ...entries],
    );
    setSheet(null);
    setToast({
      text: isEdit
        ? "Changes saved"
        : entry.kind === "transfer"
          ? `Transfer made: ${money(entry.amount)} to ${accountName(entry.toId)}`
          : `Recorded ${signed(entry.amount)}${entry.payee ? ` at ${entry.payee}` : ""}`,
      undo: entries,
    });
  }

  function remove(entry: Entry) {
    setEntries(entries.filter((e) => e.id !== entry.id));
    setSheet(null);
    setToast({
      text:
        entry.kind === "transfer" ? "Transfer deleted" : "Transaction deleted",
      undo: entries,
    });
  }

  const Recorder = { A: RecorderA, B: RecorderB, C: RecorderC }[key];

  return (
    <div className="bs rt" data-scheme={scheme} data-frame="phone">
      <div className="bs-device">
        <div className="bs-phone">
          {tab === "budget" ? (
            <BudgetScreen world={world} />
          ) : (
            <ActivityScreen
              world={world}
              onOpen={(e) => {
                setToast(null);
                setSheet({ editing: e });
              }}
            />
          )}
          <TabBar
            tab={tab}
            onTab={setTab}
            onRecord={() => {
              setToast(null);
              setSheet({ editing: null });
            }}
          />
          {toast && (
            <div className="rt-toast" role="status">
              <span>{toast.text}</span>
              {toast.undo && (
                <button
                  type="button"
                  className="rt-toast-undo"
                  onClick={() => {
                    if (toast.undo) setEntries(toast.undo);
                    setToast(null);
                  }}
                >
                  Undo
                </button>
              )}
            </div>
          )}
          {sheet && (
            <Recorder
              key={`${key}-${sheet.editing?.id ?? "new"}`}
              world={world}
              editing={sheet.editing}
              onClose={() => setSheet(null)}
              onSave={save}
              onDelete={remove}
            />
          )}
        </div>
      </div>

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
              setEntries(seed);
              setSheet(null);
              setToast(null);
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
/* A. Keypad sheet: the reference design. (+) opens straight into     */
/* money out; a segmented control switches to money in or a Transfer. */
/* Everything is on one sheet, with a keypad that never hides it.     */
/* ------------------------------------------------------------------ */

function RecorderA({
  world,
  editing,
  onClose,
  onSave,
  onDelete,
}: RecorderProps) {
  const [mode, setMode] = useState<"out" | "in" | "transfer">(
    editing?.kind === "transfer"
      ? "transfer"
      : editing && editing.amount > 0
        ? "in"
        : "out",
  );
  const [d, setD] = useDraft(editing);

  useEffect(() => {
    // A physical keyboard types into the keypad too.
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      const k = event.key === "Backspace" ? "⌫" : event.key;
      if ("0123456789.⌫".includes(k) && k.length === 1)
        setD((d) => ({ ...d, amount: press(d.amount, k) }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setD]);

  const modes = editing
    ? editing.kind === "transfer"
      ? []
      : (["out", "in"] as const)
    : (["out", "in", "transfer"] as const);

  return (
    <Sheet label={editing ? "Edit" : "Record"} full>
      <SheetHead
        title={
          editing
            ? editing.kind === "transfer"
              ? "Edit Transfer"
              : "Edit Transaction"
            : "Record"
        }
        onClose={onClose}
      />
      {modes.length > 0 && (
        <div className="rt-pad">
          <Segmented
            label="What are you recording?"
            value={mode}
            options={modes.map((m) => ({
              value: m,
              label: { out: "Money out", in: "Money in", transfer: "Transfer" }[
                m
              ],
            }))}
            onChange={(m) => {
              setMode(m);
              if (m !== "transfer") setD(withDirection(d, m));
            }}
          />
        </div>
      )}
      {mode === "transfer" ? (
        <TransferForm
          world={world}
          editing={editing?.kind === "transfer" ? editing : null}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : (
        <>
          <div className="rt-body a-body">
            <div className="a-amount">
              <p
                className="rt-amount num"
                data-direction={d.direction}
                data-empty={d.amount === ""}
              >
                {d.direction === "out" ? "−" : "+"}${d.amount || "0"}
              </p>
            </div>
            <div className="a-pair">
              <PayeeField world={world} draft={d} onChange={setD} />
              <DateField
                compact
                value={d.date}
                onChange={(date) => setD({ ...d, date })}
              />
            </div>
            <CategoryChips
              world={world}
              draft={d}
              except={editing?.id}
              onChange={(categoryId) => setD({ ...d, categoryId })}
            />
            <AccountField
              world={world}
              value={d.accountId}
              except={editing?.id}
              onChange={(accountId) => setD({ ...d, accountId })}
            />
          </div>
          <div className="a-bottom">
            <AfterMeter world={world} draft={d} except={editing?.id} />
            <Keypad
              onPress={(k) => setD({ ...d, amount: press(d.amount, k) })}
            />
            <SaveRow
              draft={d}
              editing={editing}
              onSave={() => onSave(toTransaction(d, editing))}
              onDelete={editing ? () => onDelete(editing) : undefined}
            />
          </div>
        </>
      )}
    </Sheet>
  );
}

function CategoryChips({
  world,
  draft: d,
  except,
  onChange,
}: {
  world: World;
  draft: Draft;
  except?: string;
  onChange(categoryId: string | null): void;
}) {
  return (
    <fieldset className="rt-fieldset">
      <legend className="small muted">
        {d.direction === "in" ? "Where does it go?" : "Category"}
      </legend>
      <div className="a-chips">
        {d.direction === "in" && (
          <button
            type="button"
            className="chip"
            aria-pressed={d.categoryId === null}
            onClick={() => onChange(null)}
          >
            Ready to Assign
          </button>
        )}
        {categories.map((x) => (
          <button
            key={x.id}
            type="button"
            className="chip"
            aria-pressed={d.categoryId === x.id}
            data-state={stateOf(world.available(x.id, except))}
            onClick={() => onChange(x.id)}
          >
            <Tile name={x.name} small />
            {x.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Keypad({ onPress }: { onPress(key: string): void }) {
  return (
    <div className="keypad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
        <button
          key={k}
          type="button"
          className="key"
          aria-label={k === "⌫" ? "Delete digit" : k === "." ? "Point" : k}
          onClick={() => onPress(k)}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

function press(typed: string, key: string): string {
  if (key === "⌫") return typed.slice(0, -1);
  if (key === ".") return typed.includes(".") ? typed : `${typed || "0"}.`;
  if (/\.\d\d$/.test(typed)) return typed;
  if (typed === "0") return key;
  if (typed.replace(".", "").length >= 8) return typed;
  return typed + key;
}

/* ------------------------------------------------------------------ */
/* B. One thing at a time: (+) asks Transaction or Transfer, then one */
/* question per screen with the phone's own number keyboard: amount,  */
/* then Category (each showing Available now and after), then the     */
/* rest on a review screen. Editing opens on that review screen.      */
/* ------------------------------------------------------------------ */

function RecorderB({
  world,
  editing,
  onClose,
  onSave,
  onDelete,
}: RecorderProps) {
  const [step, setStep] = useState<
    "menu" | "amount" | "category" | "review" | "transfer"
  >(editing ? (editing.kind === "transfer" ? "transfer" : "review") : "menu");
  const [d, setD] = useDraft(editing);
  const [search, setSearch] = useState("");
  const delta = signedAmount(d);

  if (step === "menu")
    return (
      <div className="rt-scrim">
        <button
          type="button"
          className="rt-backdrop"
          aria-label="Close"
          onClick={onClose}
        />
        <div
          className="b-menu"
          role="menu"
          aria-label="Record"
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        >
          <button
            type="button"
            role="menuitem"
            className="b-menu-item"
            onClick={() => setStep("amount")}
            // biome-ignore lint/a11y/noAutofocus: the menu opens from (+)
            autoFocus
          >
            <span className="b-menu-icon" aria-hidden>
              <Plus />
            </span>
            <span>
              <strong>Record a Transaction</strong>
              <span className="muted small b-menu-sub">
                Money you spent or received
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="b-menu-item"
            onClick={() => setStep("transfer")}
          >
            <span className="b-menu-icon" aria-hidden>
              <Arrows />
            </span>
            <span>
              <strong>Make a Transfer</strong>
              <span className="muted small b-menu-sub">
                Move money between your Accounts
              </span>
            </span>
          </button>
        </div>
      </div>
    );

  if (step === "transfer")
    return (
      <Sheet label="Transfer" full>
        <SheetHead
          title={editing ? "Edit Transfer" : "Make a Transfer"}
          onClose={onClose}
        />
        <TransferForm
          world={world}
          editing={editing?.kind === "transfer" ? editing : null}
          onSave={onSave}
          onDelete={onDelete}
        />
      </Sheet>
    );

  const back = editing ? () => setStep("review") : undefined;

  if (step === "amount")
    return (
      <Sheet label="Amount" full>
        <SheetHead
          title="How much?"
          onClose={onClose}
          onBack={back}
          step={editing ? undefined : "1 of 3"}
        />
        <form
          className="rt-body b-amount"
          onSubmit={(e) => {
            e.preventDefault();
            if (parse(d.amount) > 0) setStep(editing ? "review" : "category");
          }}
        >
          <Segmented
            label="Money out or in?"
            value={d.direction}
            options={[
              { value: "out", label: "Money out" },
              { value: "in", label: "Money in" },
            ]}
            onChange={(m) => setD(withDirection(d, m))}
          />
          <label className="b-amount-field" data-direction={d.direction}>
            <span className="visually-hidden">Amount</span>
            <span aria-hidden>{d.direction === "out" ? "−$" : "+$"}</span>
            <input
              className="rt-amount num"
              inputMode="decimal"
              placeholder="0.00"
              value={d.amount}
              onChange={(e) =>
                setD({ ...d, amount: e.target.value.replace(/[^\d.]/g, "") })
              }
              // biome-ignore lint/a11y/noAutofocus: the step is the amount
              autoFocus
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary btn-wide b-next"
            disabled={parse(d.amount) <= 0}
          >
            {editing ? "Done" : "Next"}
          </button>
        </form>
      </Sheet>
    );

  if (step === "category") {
    const q = search.toLowerCase();
    const shown = categories.filter((x) => x.name.toLowerCase().includes(q));
    const pick = (categoryId: string | null) => {
      setD({ ...d, categoryId });
      setStep("review");
    };
    return (
      <Sheet label="Category" full>
        <SheetHead
          title={
            d.direction === "in" ? "Where does it go?" : "What was it for?"
          }
          onClose={onClose}
          onBack={back ?? (() => setStep("amount"))}
          step={editing ? undefined : "2 of 3"}
        />
        <div className="rt-pad">
          <input
            className="rt-search"
            type="search"
            placeholder="Find a Category"
            aria-label="Find a Category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="rt-body">
          <p className="small muted">
            {money(Math.abs(delta))} {d.direction === "out" ? "out" : "in"}.
            Each Category shows what it has now, and after this.
          </p>
          {d.direction === "in" && !q && (
            <ul className="card rt-list">
              <li>
                <button
                  type="button"
                  className="rt-list-row"
                  aria-pressed={d.categoryId === null}
                  onClick={() => pick(null)}
                >
                  <span className="rt-list-name">
                    <strong>Ready to Assign</strong>
                    <span className="small muted">Income, like a paycheck</span>
                  </span>
                  <span className="b-after num small">
                    <span className="muted">
                      {money(world.readyToAssign(editing?.id))}
                    </span>
                    <span className="pill" data-state="available">
                      {money(world.readyToAssign(editing?.id) + delta)}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          )}
          {groups.map((g) => {
            const rows = shown.filter((x) => x.group === g);
            if (rows.length === 0) return null;
            return (
              <section key={g}>
                <h3 className="rt-group">{g}</h3>
                <ul className="card rt-list">
                  {rows.map((x) => {
                    const now = world.available(x.id, editing?.id);
                    return (
                      <li key={x.id}>
                        <button
                          type="button"
                          className="rt-list-row"
                          aria-pressed={d.categoryId === x.id}
                          onClick={() => pick(x.id)}
                        >
                          <Tile name={x.name} />
                          <span className="rt-list-name">{x.name}</span>
                          <span className="b-after num small">
                            <span className="muted">{money(now)}</span>
                            <span
                              className="pill"
                              data-state={stateOf(now + delta)}
                            >
                              {money(now + delta)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </Sheet>
    );
  }

  // review
  const category = categoryById(d.categoryId);
  return (
    <Sheet label="Review" full>
      <SheetHead
        title={editing ? "Edit Transaction" : "Anything else?"}
        onClose={onClose}
        onBack={editing ? undefined : () => setStep("category")}
        step={editing ? undefined : "3 of 3"}
      />
      <div className="rt-body">
        <div className="card b-summary">
          <button
            type="button"
            className="b-summary-line"
            onClick={() => setStep("amount")}
          >
            <span className="muted small">
              {d.direction === "out" ? "Money out" : "Money in"}
            </span>
            <span
              className="rt-amount b-summary-amount num"
              data-direction={d.direction}
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
              {d.direction === "in" ? "Goes to" : "Category"}
            </span>
            <span className="b-summary-cat">
              {category ? (
                <>
                  <Tile name={category.name} small />
                  {category.name}
                </>
              ) : d.direction === "in" ? (
                "Ready to Assign"
              ) : (
                <span className="link">Choose a Category</span>
              )}
            </span>
          </button>
          <AfterMeter world={world} draft={d} except={editing?.id} bare />
        </div>
        <PayeeField world={world} draft={d} onChange={setD} />
        <DateField value={d.date} onChange={(date) => setD({ ...d, date })} />
        <AccountField
          world={world}
          value={d.accountId}
          except={editing?.id}
          onChange={(accountId) => setD({ ...d, accountId })}
        />
      </div>
      <div className="rt-foot">
        <SaveRow
          draft={d}
          editing={editing}
          onSave={() => onSave(toTransaction(d, editing))}
          onDelete={editing ? () => onDelete(editing) : undefined}
        />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* C. Category first: (+) asks "What's it for?" before anything else. */
/* Money in to Ready to Assign and a Transfer sit at the top of that  */
/* list. The entry screen is headed by the chosen Category, with its  */
/* Available counting down live as you type.                          */
/* ------------------------------------------------------------------ */

function RecorderC({
  world,
  editing,
  onClose,
  onSave,
  onDelete,
}: RecorderProps) {
  const [stage, setStage] = useState<"pick" | "entry" | "transfer">(
    editing ? (editing.kind === "transfer" ? "transfer" : "entry") : "pick",
  );
  const [d, setD] = useDraft(editing);
  const [search, setSearch] = useState("");

  if (stage === "transfer")
    return (
      <Sheet label="Transfer" full>
        <SheetHead
          title={editing ? "Edit Transfer" : "Make a Transfer"}
          onClose={onClose}
          onBack={editing ? undefined : () => setStage("pick")}
        />
        <TransferForm
          world={world}
          editing={editing?.kind === "transfer" ? editing : null}
          onSave={onSave}
          onDelete={onDelete}
        />
      </Sheet>
    );

  if (stage === "pick") {
    const q = search.toLowerCase();
    const shown = categories.filter((x) => x.name.toLowerCase().includes(q));
    const pick = (categoryId: string | null, direction: "out" | "in") => {
      setD({ ...d, categoryId, direction });
      setStage("entry");
    };
    return (
      <Sheet label="What's it for?">
        <SheetHead
          title={editing ? "Change Category" : "What’s it for?"}
          onClose={editing ? () => setStage("entry") : onClose}
        />
        <div className="rt-pad">
          <input
            className="rt-search"
            type="search"
            placeholder="Find a Category"
            aria-label="Find a Category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="rt-body">
          {!q && !editing && (
            <>
              <div className="c-again">
                {world.payees.slice(0, 3).map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setD({
                        ...d,
                        payee: p.name,
                        categoryId: p.categoryId,
                        accountId: p.accountId,
                        direction: p.categoryId ? "out" : "in",
                      });
                      setStage("entry");
                    }}
                  >
                    {p.name}
                    <span className="muted">
                      {categoryById(p.categoryId)?.name ?? "Ready to Assign"}
                    </span>
                  </button>
                ))}
              </div>
              <ul className="card rt-list">
                <li>
                  <button
                    type="button"
                    className="rt-list-row"
                    onClick={() => pick(null, "in")}
                  >
                    <span className="c-icon c-icon-in" aria-hidden>
                      <Plus />
                    </span>
                    <span className="rt-list-name">
                      <strong>Money in</strong>
                      <span className="small muted">
                        A paycheck or other income, to Ready to Assign
                      </span>
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="rt-list-row"
                    onClick={() => setStage("transfer")}
                  >
                    <span className="c-icon" aria-hidden>
                      <Arrows />
                    </span>
                    <span className="rt-list-name">
                      <strong>Transfer</strong>
                      <span className="small muted">
                        Move money between your Accounts
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
            </>
          )}
          {groups.map((g) => {
            const rows = shown.filter((x) => x.group === g);
            if (rows.length === 0) return null;
            return (
              <section key={g}>
                <h3 className="rt-group">{g}</h3>
                <ul className="card rt-list">
                  {rows.map((x) => {
                    const now = world.available(x.id, editing?.id);
                    return (
                      <li key={x.id}>
                        <button
                          type="button"
                          className="rt-list-row"
                          aria-pressed={d.categoryId === x.id}
                          onClick={() =>
                            pick(x.id, editing ? d.direction : "out")
                          }
                        >
                          <Tile name={x.name} />
                          <span className="rt-list-name">{x.name}</span>
                          <span className="pill num" data-state={stateOf(now)}>
                            {money(now)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </Sheet>
    );
  }

  // entry
  const category = categoryById(d.categoryId);
  const delta = signedAmount(d);
  return (
    <Sheet label="Record" full>
      <SheetHead
        title={editing ? "Edit Transaction" : "Record"}
        onClose={onClose}
        onBack={editing ? undefined : () => setStage("pick")}
      />
      <div className="rt-body">
        {category ? (
          <CategoryHead
            world={world}
            category={category}
            delta={delta}
            except={editing?.id}
            onChange={() => setStage("pick")}
          />
        ) : (
          <div className="hero c-head">
            <div className="split">
              <span className="hero-label">Ready to Assign</span>
              <button
                type="button"
                className="link c-change c-change-hero"
                onClick={() => setStage("pick")}
              >
                Change
              </button>
            </div>
            <p className="display num">
              {money(world.readyToAssign(editing?.id) + delta)}
            </p>
            <p className="hero-muted small">
              {delta > 0
                ? `${money(delta)} more to give a job.`
                : "Money in without a Category lands here."}
            </p>
          </div>
        )}
        <div className="c-amount-row">
          <label className="rt-field c-amount">
            <span className="small muted">
              {d.direction === "out" ? "Amount spent" : "Amount received"}
            </span>
            <span className="c-amount-input" data-direction={d.direction}>
              <span aria-hidden>{d.direction === "out" ? "−$" : "+$"}</span>
              <input
                className="num"
                inputMode="decimal"
                placeholder="0.00"
                value={d.amount}
                onChange={(e) =>
                  setD({ ...d, amount: e.target.value.replace(/[^\d.]/g, "") })
                }
                // biome-ignore lint/a11y/noAutofocus: the amount is what's left to say
                autoFocus={!editing}
              />
            </span>
          </label>
          {category && (
            <label className="c-refund small">
              <input
                type="checkbox"
                checked={d.direction === "in"}
                onChange={(e) =>
                  setD({ ...d, direction: e.target.checked ? "in" : "out" })
                }
              />
              Refund
            </label>
          )}
        </div>
        <PayeeField world={world} draft={d} onChange={setD} />
        <DateField value={d.date} onChange={(date) => setD({ ...d, date })} />
        <AccountField
          world={world}
          value={d.accountId}
          except={editing?.id}
          onChange={(accountId) => setD({ ...d, accountId })}
        />
      </div>
      <div className="rt-foot">
        <SaveRow
          draft={d}
          editing={editing}
          onSave={() => onSave(toTransaction(d, editing))}
          onDelete={editing ? () => onDelete(editing) : undefined}
        />
      </div>
    </Sheet>
  );
}

function CategoryHead({
  world,
  category: x,
  delta,
  except,
  onChange,
}: {
  world: World;
  category: Category;
  delta: number;
  except?: string;
  onChange(): void;
}) {
  const now = world.available(x.id, except);
  const after = now + delta;
  const used = x.had <= 0 ? (after < 0 ? 1 : 0) : (x.had - after) / x.had;
  return (
    <div className="card c-head">
      <div className="c-head-title">
        <Tile name={x.name} />
        <span className="c-head-name">{x.name}</span>
        <button type="button" className="link c-change" onClick={onChange}>
          Change
        </button>
      </div>
      <p className="c-head-available num" data-state={stateOf(after)}>
        {money(after)}
      </p>
      <span className="bar" data-over={after < 0} aria-hidden>
        <i style={{ width: `${Math.max(0, Math.min(used, 1)) * 100}%` }} />
      </span>
      <p className="small muted" aria-live="polite">
        {delta === 0
          ? `Available now. It counts down as you type.`
          : after < 0
            ? `This overspends ${x.name} by ${money(-after)}.`
            : `Available after this, down from ${money(now)}.`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared parts                                                       */
/* ------------------------------------------------------------------ */

type Draft = {
  direction: "out" | "in";
  amount: string;
  payee: string;
  date: string;
  accountId: string;
  categoryId: string | null;
};

function useDraft(editing: Entry | null) {
  return useState<Draft>(() =>
    editing?.kind === "transaction"
      ? {
          direction: editing.amount < 0 ? "out" : "in",
          amount: typedFrom(editing.amount),
          payee: editing.payee,
          date: editing.date,
          accountId: editing.accountId,
          categoryId: editing.categoryId,
        }
      : {
          direction: "out",
          amount: "",
          payee: "",
          date: TODAY,
          accountId: "checking",
          categoryId: null,
        },
  );
}

/** Money in starts at Ready to Assign; money out must pick a Category. */
function withDirection(d: Draft, direction: "out" | "in"): Draft {
  if (d.direction === direction) return d;
  return { ...d, direction, categoryId: null };
}

const signedAmount = (d: Draft) =>
  d.direction === "out" ? -parse(d.amount) : parse(d.amount);

const canSave = (d: Draft) =>
  parse(d.amount) > 0 && (d.direction === "in" || d.categoryId !== null);

function toTransaction(d: Draft, editing: Entry | null): Transaction {
  return {
    kind: "transaction",
    id: editing?.id ?? crypto.randomUUID(),
    amount: signedAmount(d),
    payee: d.payee.trim(),
    date: d.date,
    accountId: d.accountId,
    categoryId: d.categoryId,
  };
}

const stateOf = (n: number) =>
  n < 0 ? "overspent" : n === 0 ? "zero" : "available";

function Sheet({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rt-scrim">
      <div
        className="rt-sheet"
        data-full={full}
        role="dialog"
        aria-modal
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

function SheetHead({
  title,
  onClose,
  onBack,
  step,
}: {
  title: string;
  onClose(): void;
  onBack?: () => void;
  step?: string;
}) {
  return (
    <div className="rt-head">
      {onBack ? (
        <button type="button" className="link" onClick={onBack}>
          Back
        </button>
      ) : (
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
      )}
      <h2 className="rt-title">{title}</h2>
      <span className="small muted rt-step">{step}</span>
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
    <fieldset className="seg">
      <legend className="visually-hidden">{label}</legend>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

function PayeeField({
  world,
  draft: d,
  onChange,
}: {
  world: World;
  draft: Draft;
  onChange(d: Draft): void;
}) {
  const id = useId();
  const typed = d.payee.toLowerCase();
  const matches = typed
    ? world.payees
        .filter(
          (p) =>
            p.name.toLowerCase().startsWith(typed) &&
            p.name.toLowerCase() !== typed,
        )
        .slice(0, 3)
    : [];
  return (
    <div className="rt-field">
      <label htmlFor={id} className="small muted">
        Payee
      </label>
      <input
        id={id}
        value={d.payee}
        placeholder="Who was it?"
        autoComplete="off"
        onChange={(e) => onChange({ ...d, payee: e.target.value })}
      />
      {matches.length > 0 && (
        <div className="rt-suggest">
          {matches.map((p) => (
            <button
              key={p.name}
              type="button"
              className="chip chip-small"
              onClick={() =>
                // A known Payee brings its last Category along, unless one
                // is already chosen.
                onChange({
                  ...d,
                  payee: p.name,
                  categoryId:
                    d.categoryId ??
                    (d.direction === "out" ? p.categoryId : d.categoryId),
                  accountId: p.accountId,
                })
              }
            >
              {p.name}
              {p.categoryId && (
                <span className="muted">
                  {categoryById(p.categoryId)?.name}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DateField({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange(date: string): void;
  compact?: boolean;
}) {
  const id = useId();
  if (compact)
    return (
      <div className="rt-field">
        <label htmlFor={id} className="small muted">
          Date
        </label>
        <span className="rt-date-face">{dayName(value)}</span>
        <input
          id={id}
          type="date"
          className="rt-date-over"
          value={value}
          max={TODAY}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </div>
    );
  const other = value !== TODAY && value !== YESTERDAY;
  return (
    <fieldset className="rt-fieldset">
      <legend className="small muted">Date</legend>
      <div className="row-gap">
        <button
          type="button"
          className="chip"
          aria-pressed={value === TODAY}
          onClick={() => onChange(TODAY)}
        >
          Today
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={value === YESTERDAY}
          onClick={() => onChange(YESTERDAY)}
        >
          Yesterday
        </button>
        <span className="chip rt-date-chip" data-pressed={other}>
          {other ? dayName(value) : "Another day"}
          <input
            type="date"
            className="rt-date-over"
            aria-label="Another day"
            value={value}
            max={TODAY}
            onChange={(e) => e.target.value && onChange(e.target.value)}
          />
        </span>
      </div>
    </fieldset>
  );
}

function AccountField({
  world,
  value,
  except,
  onChange,
  label = "Account",
}: {
  world: World;
  value: string;
  except?: string;
  onChange(accountId: string): void;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="rt-field rt-account">
      <label htmlFor={id} className="small muted">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {money(world.balance(a.id, except))}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The chosen Category's Available after this Transaction, as on the reference. */
function AfterMeter({
  world,
  draft: d,
  except,
  bare,
}: {
  world: World;
  draft: Draft;
  except?: string;
  bare?: boolean;
}) {
  const delta = signedAmount(d);
  const x = categoryById(d.categoryId);
  if (!x) {
    if (d.direction === "out")
      return (
        <p className="rt-meter small muted" data-bare={bare}>
          Choose a Category to see what it has left.
        </p>
      );
    return (
      <div className="rt-meter" data-bare={bare}>
        <div className="split small">
          <span>Ready to Assign after this</span>
          <strong className="num">
            {money(world.readyToAssign(except) + delta)}
          </strong>
        </div>
      </div>
    );
  }
  const after = world.available(x.id, except) + delta;
  const used = x.had <= 0 ? (after < 0 ? 1 : 0) : (x.had - after) / x.had;
  return (
    <div className="rt-meter" data-bare={bare} aria-live="polite">
      <div className="split small">
        <span>{x.name} after this</span>
        <strong className="num" data-state={stateOf(after)}>
          {after < 0 ? `Overspent by ${money(-after)}` : `${money(after)} left`}
        </strong>
      </div>
      <span className="bar" data-thin data-over={after < 0} aria-hidden>
        <i style={{ width: `${Math.max(0, Math.min(used, 1)) * 100}%` }} />
      </span>
    </div>
  );
}

function SaveRow({
  draft: d,
  editing,
  onSave,
  onDelete,
}: {
  draft: Draft;
  editing: Entry | null;
  onSave(): void;
  onDelete?: () => void;
}) {
  return (
    <div className="rt-save">
      {onDelete && (
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          Delete
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary rt-save-main"
        disabled={!canSave(d)}
        onClick={onSave}
      >
        {editing ? "Save changes" : "Record"}
      </button>
    </div>
  );
}

function TransferForm({
  world,
  editing,
  onSave,
  onDelete,
}: {
  world: World;
  editing: Transfer | null;
  onSave(entry: Entry): void;
  onDelete(entry: Entry): void;
}) {
  const [amount, setAmount] = useState(
    editing ? typedFrom(editing.amount) : "",
  );
  const [fromId, setFrom] = useState(editing?.fromId ?? "checking");
  const [toId, setTo] = useState(editing?.toId ?? "savings");
  const [date, setDate] = useState(editing?.date ?? TODAY);
  const n = parse(amount);
  const ok = n > 0 && fromId !== toId;
  return (
    <>
      <div className="rt-body">
        <label className="rt-field">
          <span className="small muted">Amount</span>
          <span className="c-amount-input">
            <span aria-hidden>$</span>
            <input
              className="num"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </span>
        </label>
        <AccountField
          world={world}
          label="From"
          value={fromId}
          except={editing?.id}
          onChange={setFrom}
        />
        <AccountField
          world={world}
          label="To"
          value={toId}
          except={editing?.id}
          onChange={setTo}
        />
        <DateField value={date} onChange={setDate} />
        <div className="card rt-meter">
          {fromId === toId ? (
            <p className="small note-over">Choose two different Accounts.</p>
          ) : (
            <>
              <div className="split small">
                <span>{accountName(fromId)} after this</span>
                <strong className="num">
                  {money(world.balance(fromId, editing?.id) - n)}
                </strong>
              </div>
              <div className="split small">
                <span>{accountName(toId)} after this</span>
                <strong className="num">
                  {money(world.balance(toId, editing?.id) + n)}
                </strong>
              </div>
              <p className="small muted">
                A Transfer moves money between your Accounts. Your Categories
                and Ready to Assign don’t change.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="rt-foot">
        <div className="rt-save">
          {editing && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onDelete(editing)}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary rt-save-main"
            disabled={!ok}
            onClick={() =>
              onSave({
                kind: "transfer",
                id: editing?.id ?? crypto.randomUUID(),
                amount: n,
                fromId,
                toId,
                date,
              })
            }
          >
            {editing ? "Save changes" : "Make Transfer"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The screens behind the sheet, so the effect of each save shows     */
/* ------------------------------------------------------------------ */

function BudgetScreen({ world }: { world: World }) {
  return (
    <div className="stack">
      <header className="header">
        <h1 className="title">Budget</h1>
        <span className="month">October 2026</span>
      </header>
      <div className="hero rta">
        <p className="hero-label">Ready to Assign</p>
        <p className="display num">{money(world.readyToAssign())}</p>
      </div>
      {groups.map((g) => (
        <section key={g} className="a-group">
          <h2 className="group-head">{g}</h2>
          <ul className="card">
            {categories
              .filter((x) => x.group === g)
              .map((x) => {
                const n = world.available(x.id);
                return (
                  <li key={x.id} className="a-row" data-state={stateOf(n)}>
                    <Tile name={x.name} />
                    <span className="a-name rt-grow">{x.name}</span>
                    <span className="pill num" data-state={stateOf(n)}>
                      {money(n)}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ActivityScreen({
  world,
  onOpen,
}: {
  world: World;
  onOpen(entry: Entry): void;
}) {
  const dates = [...new Set(world.entries.map((e) => e.date))].sort().reverse();
  return (
    <div className="stack">
      <header className="header">
        <h1 className="title">Activity</h1>
        <span className="month">October 2026</span>
      </header>
      {dates.map((date) => (
        <section key={date}>
          <h2 className="rt-group">{dayName(date)}</h2>
          <ul className="card rt-list">
            {world.entries
              .filter((e) => e.date === date)
              .map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="rt-list-row"
                    onClick={() => onOpen(e)}
                  >
                    {e.kind === "transfer" ? (
                      <>
                        <span className="c-icon" aria-hidden>
                          <Arrows />
                        </span>
                        <span className="rt-list-name">
                          <strong>Transfer</strong>
                          <span className="small muted">
                            {accountName(e.fromId)} to {accountName(e.toId)}
                          </span>
                        </span>
                        <span className="num">{money(e.amount)}</span>
                      </>
                    ) : (
                      <>
                        <Tile name={categoryById(e.categoryId)?.name ?? "+"} />
                        <span className="rt-list-name">
                          <strong>{e.payee || "No Payee"}</strong>
                          <span className="small muted">
                            {categoryById(e.categoryId)?.name ??
                              "Ready to Assign"}{" "}
                            · {accountName(e.accountId)}
                          </span>
                        </span>
                        <span
                          className="num rt-signed"
                          data-direction={e.amount > 0 ? "in" : "out"}
                        >
                          {signed(e.amount)}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TabBar({
  tab,
  onTab,
  onRecord,
}: {
  tab: "budget" | "activity";
  onTab(tab: "budget" | "activity"): void;
  onRecord(): void;
}) {
  return (
    <nav className="tabs" aria-label="Places">
      <button
        type="button"
        className="tab rt-tab"
        aria-current={tab === "budget" ? "page" : undefined}
        onClick={() => onTab("budget")}
      >
        <TabIcon d="M4 5h14M4 11h9M4 17h11" />
        Budget
      </button>
      <button
        type="button"
        className="tab rt-tab"
        aria-current={tab === "activity" ? "page" : undefined}
        onClick={() => onTab("activity")}
      >
        <TabIcon d="M3 12h4l3-7 4 14 3-7h3" />
        Activity
      </button>
      <button
        type="button"
        className="record"
        aria-label="Record"
        onClick={onRecord}
      >
        <Plus />
      </button>
      <span className="tab">
        <TabIcon d="M3 8h16v10H3zM3 8l3-4h10l3 4M14 13h2" />
        Accounts
      </span>
    </nav>
  );
}

function Tile({ name, small }: { name: string; small?: boolean }) {
  return (
    <span className="tile" data-small={small} aria-hidden>
      {name[0]}
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

function Arrows() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden>
      <path
        d="M4 8h13l-3-3M18 14H5l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
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
