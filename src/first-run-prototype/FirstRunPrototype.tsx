// PROTOTYPE (prototype/first-run): throwaway. Three ways to take a new user
// from opening budjet to a Budget they can use, and what each screen says
// while it is empty, for "What does first run look like, and what do the
// empty states teach?" (#84). Switch with `?first=A|B|C`.
// `?at=start|no-account|blank|ready|assigned|used` jumps to a moment,
// `?folder=asked|not-asked` is whether this browser asks for a Data Folder,
// `?place=budget|activity|accounts`, `?frame=phone|desktop`,
// `?scheme=system|dark|light`. Everything is in memory.
// A, Steps (chosen): one question per screen, several Accounts on the last,
//    then the Budget. Empty states are one sentence and one button, and the
//    first Budget screen coaches "start at the top". Hints define the word,
//    except Overspent, which uses the user's own numbers.
// B, Straight in: only what can't wait, then the real app, with a Next step
//    card. Empty states show faded examples. Hints say what to do.
// C, One page: every setup question on one page beside a live preview. Empty
//    states coach in place. Hints use the user's own numbers.
import "@fontsource-variable/geist";
import { type ReactNode, useEffect, useState } from "react";
import { useUrlParameter } from "../url-parameter";
import "../budget-screen-prototype/prototype.css";
import "../record-prototype/record.css";
import "./first-run.css";

type VariantKey = "A" | "B" | "C";
const keys: VariantKey[] = ["A", "B", "C"];
const names = { A: "Steps", B: "Straight in", C: "One page" };
const TODAY = "Oct 24";

type Kind = "Checking" | "Savings" | "Cash";
type Account = {
  id: string;
  name: string;
  kind: Kind;
  balance: number;
  opening: number;
  checked: string | null;
};
type Group = { name: string; categories: string[] };
type World = {
  setUp: boolean;
  currency: string;
  groups: Group[];
  accounts: Account[];
  assigned: Record<string, number>;
  spent: Record<string, number>;
  transactions: { payee: string; category: string; amount: number }[];
};

const starterSet: Group[] = [
  { name: "Bills", categories: ["Rent", "Power", "Phone", "Internet"] },
  {
    name: "Everyday",
    categories: ["Groceries", "Transport", "Dining Out"],
  },
  { name: "Savings", categories: ["Emergency Fund"] },
];
const everyday: Account = {
  id: "everyday",
  name: "Everyday",
  kind: "Checking",
  balance: 2400,
  opening: 2400,
  checked: null,
};
const fresh: World = {
  setUp: false,
  currency: guessCurrency(),
  groups: [],
  accounts: [],
  assigned: {},
  spent: {},
  transactions: [],
};
const someAssignments = {
  Rent: 1200,
  Power: 90,
  Phone: 40,
  Internet: 60,
  Groceries: 500,
  Transport: 120,
  "Dining Out": 60,
};
function worldAt(at: string): World {
  const setUp = { ...fresh, setUp: true };
  if (at === "no-account") return { ...setUp, groups: starterSet };
  if (at === "blank") return { ...setUp, accounts: [everyday] };
  if (at === "ready")
    return { ...setUp, groups: starterSet, accounts: [everyday] };
  if (at === "assigned")
    return {
      ...setUp,
      groups: starterSet,
      accounts: [everyday],
      assigned: someAssignments,
    };
  if (at === "used")
    return {
      ...setUp,
      groups: starterSet,
      accounts: [{ ...everyday, balance: 2223.5 }],
      assigned: someAssignments,
      spent: { Groceries: 96.5, "Dining Out": 80 },
      transactions: [
        { payee: "Corner Bistro", category: "Dining Out", amount: 80 },
        { payee: "Fresh Market", category: "Groceries", amount: 96.5 },
      ],
    };
  return fresh;
}

function guessCurrency(): string {
  const region = new Intl.Locale(navigator.language).region ?? "";
  const known: Record<string, string> = {
    US: "USD",
    GB: "GBP",
    SE: "SEK",
    NO: "NOK",
    DK: "DKK",
    CA: "CAD",
    AU: "AUD",
    NZ: "NZD",
    DE: "EUR",
    FR: "EUR",
    ES: "EUR",
    IT: "EUR",
    NL: "EUR",
    FI: "EUR",
    IE: "EUR",
  };
  return known[region] ?? "USD";
}
const fmt = (w: { currency: string }, n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: w.currency,
  }).format(n);
const total = (w: World) => w.accounts.reduce((s, a) => s + a.balance, 0);
const opening = (w: World) => w.accounts.reduce((s, a) => s + a.opening, 0);
const assignedTotal = (w: World) =>
  Object.values(w.assigned).reduce((s, n) => s + n, 0);
const rta = (w: World) => opening(w) - assignedTotal(w);
const availableOf = (w: World, c: string) =>
  (w.assigned[c] ?? 0) - (w.spent[c] ?? 0);

type Act = {
  update(change: Partial<World>): void;
  go(place: string): void;
  sheet(s: "account" | "categories" | null): void;
  toast(text: string): void;
  assign(): void;
  record(): void;
};
type Props = { w: World; v: VariantKey; wide: boolean; act: Act };

export function FirstRunPrototype() {
  const [firstParam, setFirst] = useUrlParameter("first");
  const [frameParam, setFrame] = useUrlParameter("frame");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const [atParam, setAt] = useUrlParameter("at");
  const [folderParam, setFolderParam] = useUrlParameter("folder");
  const [placeParam, setPlace] = useUrlParameter("place");
  const v: VariantKey = keys.includes(firstParam as VariantKey)
    ? (firstParam as VariantKey)
    : "A";
  const frame = frameParam === "desktop" ? "desktop" : "phone";
  const scheme = schemeParam ?? "system";
  const at = atParam ?? "start";
  const folder = folderParam === "not-asked" ? "not-asked" : "asked";
  const place = placeParam ?? "budget";
  const wide = frame === "desktop";

  const [w, setW] = useState(() => worldAt(at));
  const [sheet, setSheet] = useState<"account" | "categories" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    setW(worldAt(at));
    setSheet(null);
    setRun((r) => r + 1);
  }, [at]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function cycle(by: number) {
    setFirst(keys[(keys.indexOf(v) + by + keys.length) % keys.length], "push");
  }

  const act: Act = {
    update: (change) => setW((old) => ({ ...old, ...change })),
    go: (p) => setPlace(p, "push"),
    sheet: setSheet,
    toast: setToast,
    assign: () => {
      setW((old) => ({ ...old, assigned: someAssignments }));
      setToast("Stand-in for the Assign walk: Categories filled");
    },
    record: () => {
      setW((old) =>
        old.accounts.length === 0
          ? old
          : {
              ...old,
              accounts: old.accounts.map((a, i) =>
                i === 0 ? { ...a, balance: a.balance - 18.5 } : a,
              ),
              spent: {
                ...old.spent,
                Groceries: (old.spent.Groceries ?? 0) + 18.5,
              },
              transactions: [
                {
                  payee: "Fresh Market",
                  category: "Groceries",
                  amount: 18.5,
                },
                ...old.transactions,
              ],
            },
      );
      setToast("Stand-in for recording: −18.50 at Fresh Market");
    },
  };
  const finish = (change: Partial<World>) => {
    setW((old) => ({ ...old, ...change, setUp: true }));
    setPlace("budget", "replace");
  };
  const openExisting = () => {
    setW(worldAt("used"));
    setPlace("budget", "replace");
    setToast("Opened the Budget in this folder");
  };
  const setupProps = { w, wide, folder, finish, openExisting };
  const setup = !w.setUp && (
    <div key={`${v}-${run}`} data-host={v}>
      {v === "A" && <SetupSteps {...setupProps} />}
      {v === "B" && <SetupStraightIn {...setupProps} />}
      {v === "C" && <SetupOnePage {...setupProps} />}
    </div>
  );
  const screen = (
    <div>
      {place === "activity" ? (
        <Activity w={w} v={v} wide={wide} act={act} />
      ) : place === "accounts" ? (
        <Accounts w={w} v={v} wide={wide} act={act} />
      ) : (
        <Budget w={w} v={v} wide={wide} act={act} />
      )}
    </div>
  );
  const overlays = (
    <>
      {sheet === "account" && (
        <AddAccountSheet
          w={w}
          onClose={() => setSheet(null)}
          onAdd={(a) => {
            act.update({ accounts: [...w.accounts, a] });
            setSheet(null);
            setToast(`Added ${a.name}. Undo`);
          }}
        />
      )}
      {sheet === "categories" && (
        <CategoriesSheet
          onClose={() => setSheet(null)}
          onPick={(groups) => {
            act.update({ groups });
            setSheet(null);
          }}
        />
      )}
      {toast && (
        <div className="fr-toast" role="status">
          {toast}
        </div>
      )}
    </>
  );

  return (
    <div className="bs rt fr" data-scheme={scheme} data-frame={frame}>
      {wide ? (
        setup ? (
          <div className="fr-desktop-setup">
            {setup}
            {overlays}
          </div>
        ) : (
          <div className="bs-desktop">
            <Rail w={w} place={place} act={act} />
            <main className="bs-main">{screen}</main>
            {overlays}
          </div>
        )
      ) : (
        <div className="bs-device">
          <div className="bs-phone">
            {setup || screen}
            {!setup && <TabBar place={place} act={act} />}
            {overlays}
          </div>
        </div>
      )}

      {import.meta.env.DEV && (
        <div className="bs-switcher">
          <button type="button" onClick={() => cycle(-1)} aria-label="Previous">
            ←
          </button>
          <span>
            {v} ({names[v]})
          </span>
          <button type="button" onClick={() => cycle(1)} aria-label="Next">
            →
          </button>
          <select
            value={at}
            onChange={(e) => setAt(e.target.value, "replace")}
            aria-label="Moment"
          >
            <option value="start">First open</option>
            <option value="no-account">No Accounts</option>
            <option value="blank">No Categories</option>
            <option value="ready">Just set up</option>
            <option value="assigned">Assigned, nothing recorded</option>
            <option value="used">In use, Overspent</option>
          </select>
          <select
            value={folder}
            onChange={(e) => setFolderParam(e.target.value, "replace")}
            aria-label="Data Folder"
          >
            <option value="asked">Asks for Data Folder</option>
            <option value="not-asked">No Data Folder</option>
          </select>
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
              setW(worldAt(at));
              setRun(run + 1);
              setSheet(null);
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ shared setup parts ------------------ */

type SetupProps = {
  w: World;
  wide: boolean;
  folder: string;
  finish(change: Partial<World>): void;
  openExisting(): void;
};

function CurrencyField({
  value,
  onChange,
}: {
  value: string;
  onChange(c: string): void;
}) {
  const display = new Intl.DisplayNames(undefined, { type: "currency" });
  return (
    <label className="fr-field">
      <span className="muted small">Currency</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Intl.supportedValuesOf("currency").map((c) => (
          <option key={c} value={c}>
            {c}, {display.of(c)}
          </option>
        ))}
      </select>
    </label>
  );
}

function AccountFields({
  value,
  placeholder = "Everyday",
  onChange,
}: {
  value: { name: string; kind: Kind; holds: string };
  placeholder?: string;
  onChange(v: { name: string; kind: Kind; holds: string }): void;
}) {
  const kinds: Kind[] = ["Checking", "Savings", "Cash"];
  return (
    <>
      <label className="fr-field">
        <span className="muted small">Name</span>
        <input
          value={value.name}
          placeholder={placeholder}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <div className="fr-kinds">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.kind === k}
            onClick={() => onChange({ ...value, kind: k })}
          >
            {k}
          </button>
        ))}
      </div>
      <label className="fr-field">
        <span className="muted small">What it holds today</span>
        <input
          className="num"
          inputMode="decimal"
          placeholder="0.00"
          value={value.holds}
          onChange={(e) => onChange({ ...value, holds: e.target.value })}
        />
      </label>
    </>
  );
}
const toAccount = (v: { name: string; kind: Kind; holds: string }): Account => {
  const n = Number.parseFloat(v.holds) || 0;
  return {
    id: crypto.randomUUID(),
    name: v.name.trim() || "Everyday",
    kind: v.kind,
    balance: n,
    opening: n,
    checked: null,
  };
};

function FolderPicker({
  onEmpty,
  onExisting,
}: {
  onEmpty(): void;
  onExisting(): void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => setOpen(true)}
      >
        Choose a folder
      </button>
      {open && (
        <div className="fr-scrim">
          <div className="fr-dialog" role="dialog" aria-label="Folder">
            <p className="muted small">
              Stand-in for the browser's folder picker. Which folder did you
              pick?
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-wide"
              onClick={onEmpty}
            >
              A new, empty folder
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-wide"
              onClick={onExisting}
            >
              A folder that already holds a Budget
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------ A. Steps ---------------------------- */

function SetupSteps({ w, folder, finish, openExisting }: SetupProps) {
  const steps = [
    "welcome",
    ...(folder === "asked" ? ["folder"] : []),
    "currency",
    "categories",
    "account",
  ];
  const [i, setI] = useState(0);
  const [currency, setCurrency] = useState(w.currency);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const blankAccount = { name: "", kind: "Checking" as Kind, holds: "" };
  const [account, setAccount] = useState(blankAccount);
  const [added, setAdded] = useState<Account[]>([]);
  const [adding, setAdding] = useState(true);
  const step = steps[i];
  const next = () => setI(i + 1);
  const progress = i > 0 && (
    <div className="fr-progress">
      <button type="button" className="link" onClick={() => setI(i - 1)}>
        ‹ Back
      </button>
      <span className="muted small">
        {i} of {steps.length - 1}
      </span>
    </div>
  );
  return (
    <div className="fr-setup">
      {progress}
      {step === "welcome" && (
        <>
          <p className="fr-brand">budjet</p>
          <h1 className="fr-title">Give every dollar a job.</h1>
          <p className="muted">
            Tell budjet what's in your Accounts, then decide what each dollar is
            for. When you spend, you'll see what's left for that job.
          </p>
          {folder === "not-asked" && (
            <p className="muted small">
              Your Budget stays in this browser, on this device.
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={next}
          >
            Get started
          </button>
        </>
      )}
      {step === "folder" && (
        <>
          <h1 className="fr-title">Where should your Budget live?</h1>
          <p className="muted">
            Pick a folder on this device. budjet keeps everything there, and
            nothing goes to us.
          </p>
          <p className="muted small">
            Want it on your other devices? Pick a folder your sync service
            already watches. Already using budjet elsewhere? Pick that same
            folder and your Budget opens.
          </p>
          <FolderPicker onEmpty={next} onExisting={openExisting} />
        </>
      )}
      {step === "currency" && (
        <>
          <h1 className="fr-title">What currency is your Budget in?</h1>
          <p className="muted">
            A Budget has one currency, and you can't change it later.
          </p>
          <CurrencyField value={currency} onChange={setCurrency} />
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={next}
          >
            Next
          </button>
        </>
      )}
      {step === "categories" && (
        <>
          <h1 className="fr-title">Start with some Categories?</h1>
          <p className="muted">
            A Category is a job for your money, like Rent or Groceries. You can
            rename, hide or add to these any time.
          </p>
          <button
            type="button"
            className="fr-choice"
            onClick={() => {
              setGroups(starterSet);
              next();
            }}
          >
            <b>Use the starter set</b>
            <span className="muted small">
              {starterSet.flatMap((g) => g.categories).join(", ")}
            </span>
          </button>
          <button
            type="button"
            className="fr-choice"
            onClick={() => {
              setGroups([]);
              next();
            }}
          >
            <b>Start blank</b>
            <span className="muted small">
              You'll add your own on the Budget screen.
            </span>
          </button>
        </>
      )}
      {step === "account" && (
        <>
          <h1 className="fr-title">Where's your money now?</h1>
          <p className="muted">
            Add each place you keep money you could spend soon: checking,
            savings or cash. You can add more later.
          </p>
          {added.length > 0 && (
            <ul className="card">
              {added.map((a) => (
                <li key={a.id} className="fr-row">
                  <span className="tile" aria-hidden>
                    {a.name[0]}
                  </span>
                  <span className="fr-row-body">
                    {a.name}
                    <br />
                    <span className="muted small">{a.kind}</span>
                  </span>
                  <span className="num">{fmt({ currency }, a.opening)}</span>
                  <button
                    type="button"
                    className="link small"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => {
                      const rest = added.filter((x) => x.id !== a.id);
                      setAdded(rest);
                      if (rest.length === 0) setAdding(true);
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {adding ? (
            <>
              <AccountFields
                value={account}
                placeholder={added.length === 0 ? "Everyday" : "Savings"}
                onChange={setAccount}
              />
              <p className="muted small">
                This is its Opening Balance. It goes to Ready to Assign, for you
                to give every dollar a job.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-wide"
                disabled={account.name.trim() === ""}
                onClick={() => {
                  setAdded([...added, toAccount(account)]);
                  setAccount(blankAccount);
                  setAdding(false);
                }}
              >
                Add Account
              </button>
              {added.length > 0 && (
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => {
                    setAccount(blankAccount);
                    setAdding(false);
                  }}
                >
                  Cancel
                </button>
              )}
            </>
          ) : (
            <>
              <p className="muted small">
                {fmt(
                  { currency },
                  added.reduce((sum, a) => sum + a.opening, 0),
                )}{" "}
                goes to Ready to Assign, for you to give every dollar a job.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-wide"
                onClick={() => setAdding(true)}
              >
                Add another Account
              </button>
              <button
                type="button"
                className="btn btn-primary btn-wide"
                onClick={() =>
                  finish({
                    currency,
                    groups: groups ?? starterSet,
                    accounts: added,
                  })
                }
              >
                Open my Budget
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ B. Straight in ---------------------- */

function SetupStraightIn({ w, folder, finish, openExisting }: SetupProps) {
  const [currency, setCurrency] = useState(w.currency);
  const [folderChosen, setFolderChosen] = useState(false);
  const needFolder = folder === "asked" && !folderChosen;
  return (
    <div className="fr-setup">
      <p className="fr-brand">budjet</p>
      <h1 className="fr-title">Give every dollar a job.</h1>
      <p className="muted">
        Two things can't wait. The rest happens in the app.
      </p>
      {needFolder ? (
        <>
          <p className="muted">
            First, pick a folder for your Budget. Pick one your sync service
            watches to have it on your other devices, or the one you already use
            with budjet to open your Budget.
          </p>
          <FolderPicker
            onEmpty={() => setFolderChosen(true)}
            onExisting={openExisting}
          />
        </>
      ) : (
        <>
          <p className="muted">
            {folder === "asked"
              ? "Now the currency. A Budget has one, and you can't change it later."
              : "Your Budget stays in this browser, on this device. Pick its currency. A Budget has one, and you can't change it later."}
          </p>
          <CurrencyField value={currency} onChange={setCurrency} />
          <button
            type="button"
            className="btn btn-primary btn-wide"
            onClick={() => finish({ currency })}
          >
            Open my Budget
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------ C. One page ------------------------- */

function SetupOnePage({ w, wide, folder, finish, openExisting }: SetupProps) {
  const [currency, setCurrency] = useState(w.currency);
  const [folderChosen, setFolderChosen] = useState(false);
  const [useStarter, setUseStarter] = useState(true);
  const [off, setOff] = useState<string[]>([]);
  const [account, setAccount] = useState({
    name: "",
    kind: "Checking" as Kind,
    holds: "",
  });
  const groups = useStarter
    ? starterSet
        .map((g) => ({
          ...g,
          categories: g.categories.filter((c) => !off.includes(c)),
        }))
        .filter((g) => g.categories.length > 0)
    : [];
  const holds = Number.parseFloat(account.holds) || 0;
  const blocked = folder === "asked" && !folderChosen;
  return (
    <div className="fr-oneshot" data-wide={wide}>
      <div className="fr-setup">
        <p className="fr-brand">budjet</p>
        <h1 className="fr-title">Set up your Budget</h1>
        {folder === "asked" ? (
          <section>
            <p className="fr-section-label">Where it lives</p>
            {folderChosen ? (
              <p className="muted">In the folder you picked.</p>
            ) : (
              <>
                <p className="muted small" style={{ marginBottom: 8 }}>
                  A folder on this device. Pick one your sync service watches to
                  reach your other devices, or the one you already use with
                  budjet to open your Budget.
                </p>
                <FolderPicker
                  onEmpty={() => setFolderChosen(true)}
                  onExisting={openExisting}
                />
              </>
            )}
          </section>
        ) : (
          <p className="muted small">
            Your Budget stays in this browser, on this device.
          </p>
        )}
        <section>
          <p className="fr-section-label">Currency</p>
          <CurrencyField value={currency} onChange={setCurrency} />
          <p className="muted small" style={{ marginTop: 6 }}>
            You can't change it later.
          </p>
        </section>
        <section>
          <p className="fr-section-label">Categories: jobs for your money</p>
          <div className="fr-chips" style={{ marginBottom: 8 }}>
            {useStarter &&
              starterSet
                .flatMap((g) => g.categories)
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="fr-chip"
                    data-off={off.includes(c)}
                    aria-pressed={false}
                    onClick={() =>
                      setOff(
                        off.includes(c)
                          ? off.filter((x) => x !== c)
                          : [...off, c],
                      )
                    }
                  >
                    {c}
                  </button>
                ))}
          </div>
          <button
            type="button"
            className="link small"
            onClick={() => setUseStarter(!useStarter)}
          >
            {useStarter ? "Start blank instead" : "Use the starter set"}
          </button>
        </section>
        <section className="fr-setup" style={{ gap: 8 }}>
          <p className="fr-section-label" style={{ margin: 0 }}>
            Your first Account
          </p>
          <AccountFields value={account} onChange={setAccount} />
        </section>
        {!wide && <Preview currency={currency} holds={holds} groups={groups} />}
        <button
          type="button"
          className="btn btn-primary btn-wide"
          disabled={blocked}
          onClick={() =>
            finish({ currency, groups, accounts: [toAccount(account)] })
          }
        >
          {blocked ? "Choose a folder first" : "Start budgeting"}
        </button>
      </div>
      {wide && <Preview currency={currency} holds={holds} groups={groups} />}
    </div>
  );
}

function Preview({
  currency,
  holds,
  groups,
}: {
  currency: string;
  holds: number;
  groups: Group[];
}) {
  return (
    <aside className="fr-preview" aria-label="What your Budget will look like">
      <p className="muted small">Your Budget will start like this</p>
      <div className="hero rta">
        <span className="hero-label">Ready to Assign</span>
        <span className="display num" style={{ fontSize: 36 }}>
          {fmt({ currency }, holds)}
        </span>
        <span className="hero-muted small">
          What the Account holds, waiting for a job.
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.name}>
          <p className="small" style={{ fontWeight: 650 }}>
            {g.name}
          </p>
          {g.categories.map((c) => (
            <div key={c} className="fr-preview-row small">
              <span>{c}</span>
              <span className="num muted">{fmt({ currency }, 0)}</span>
            </div>
          ))}
        </div>
      ))}
      {groups.length === 0 && <p className="muted small">No Categories yet.</p>}
    </aside>
  );
}

/* ------------------------------ hints ------------------------------- */

function hintText(
  term: "rta" | "available" | "overspent",
  { w, v, category }: { w: World; v: VariantKey; category?: string },
) {
  if (v === "A" && term !== "overspent")
    return {
      rta: "The money in your Accounts that doesn’t have a job yet.",
      available:
        "What a Category has left to spend this Month. Whatever’s left carries into next Month.",
    }[term];
  if (v === "B")
    return {
      rta: "Assign this to your Categories until it reads $0.00. Below zero, take some back.",
      available:
        "Spend up to this. If it runs out, cover it from another Category.",
      overspent:
        "Tap Cover it to give this Category more money. Until you do, it stays red, Month after Month.",
    }[term];
  const c = category ?? "Groceries";
  const has = w.assigned[c] ?? 0;
  const spent = w.spent[c] ?? 0;
  const over = "Dining Out";
  return {
    rta: `Your Accounts took in ${fmt(w, opening(w))} and you’ve assigned ${fmt(w, assignedTotal(w))}, so ${fmt(w, rta(w))} has no job yet.`,
    available: `${c} got ${fmt(w, has)} and spent ${fmt(w, spent)}, so it has ${fmt(w, has - spent)} left. Whatever’s left carries into next Month.`,
    overspent: `${over} had ${fmt(w, w.assigned[over] ?? 0)} and spent ${fmt(w, w.spent[over] ?? 0)}. Cover the ${fmt(w, (w.spent[over] ?? 0) - (w.assigned[over] ?? 0))}, or it stays red, Month after Month.`,
  }[term];
}

function Hint({
  term,
  w,
  v,
  label,
}: {
  term: "rta" | "available" | "overspent";
  w: World;
  v: VariantKey;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hint">
      <button
        type="button"
        className="hint-button"
        aria-expanded={open}
        aria-label={`What is ${label}?`}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      {open && (
        <span className="hint-bubble" role="note">
          {hintText(term, { w, v })}
        </span>
      )}
    </span>
  );
}

/* ------------------------------ Budget ------------------------------ */

function rtaLine(w: World) {
  const r = rta(w);
  if (w.accounts.length === 0) return "Add an Account to see your money here.";
  if (r < 0) return "You've assigned more than you have. Take some back.";
  if (assignedTotal(w) === 0 && r > 0)
    return "This is the money in your Accounts. Give each dollar a job.";
  if (r === 0) return "Every dollar has a job.";
  return "Give these dollars a job.";
}

function Budget({ w, v, wide, act }: Props) {
  const noAccount = w.accounts.length === 0;
  const noCategories = w.groups.length === 0;
  const summary = (
    <>
      <section className="hero rta">
        <span className="hero-label">
          Ready to Assign
          <Hint term="rta" w={w} v={v} label="Ready to Assign" />
        </span>
        <span className="display num">{fmt(w, rta(w))}</span>
        <div className="split rta-foot">
          <span className="hero-muted small">{rtaLine(w)}</span>
          {!noAccount && !noCategories && rta(w) > 0 && (
            <button type="button" className="btn btn-hero" onClick={act.assign}>
              Assign
            </button>
          )}
        </div>
      </section>
      <section className="card spent">
        <p className="muted small">Spent this Month</p>
        <p className="num" style={{ fontSize: 24, fontWeight: 700 }}>
          {fmt(
            w,
            Object.values(w.spent).reduce((s, n) => s + n, 0),
          )}
        </p>
        {w.transactions.length === 0 && (
          <p className="muted small">
            Nothing recorded yet. Spending shows up here as you record it.
          </p>
        )}
      </section>
    </>
  );
  const next = v === "B" && <NextStep w={w} act={act} />;
  const body = noCategories ? (
    <NoCategories w={w} v={v} act={act} />
  ) : (
    <div className="stack">
      {v !== "B" && assignedTotal(w) === 0 && !noAccount && (
        <p className="fr-coach">
          Start at the top with what's due soonest.{" "}
          {wide
            ? "Type what Rent needs in its Assigned column."
            : "Tap Rent and give it what it needs."}
        </p>
      )}
      {v === "C" && noAccount && (
        <p className="fr-coach">
          Your Categories are ready. They'll fill once there's money in an
          Account.
        </p>
      )}
      {wide && (
        <div className="a-table-head" aria-hidden>
          <span>Category</span>
          <span>Assigned</span>
          <span>Spending</span>
          <span>
            Available <Hint term="available" w={w} v={v} label="Available" />
          </span>
        </div>
      )}
      {w.groups.map((g) => (
        <section key={g.name} className={wide ? "a-group card" : "a-group"}>
          <div className="split group-head">
            <h2>{g.name}</h2>
            <span className="muted small">
              {!wide && (
                <>
                  Available{" "}
                  <Hint term="available" w={w} v={v} label="Available" />{" "}
                </>
              )}
              <span className="num">
                {fmt(
                  w,
                  g.categories.reduce((s, c) => s + availableOf(w, c), 0),
                )}
              </span>
            </span>
          </div>
          <ul className={wide ? undefined : "card"}>
            {g.categories.map((c) =>
              wide ? (
                <CategoryTableRow key={c} c={c} w={w} v={v} />
              ) : (
                <CategoryRow
                  key={c}
                  c={c}
                  w={w}
                  v={v}
                  coach={v !== "B" && c === "Rent" && assignedTotal(w) === 0}
                />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
  const header = (
    <header className="header">
      <h1 className="title">Budget</h1>
      <span className="month">October 2026</span>
    </header>
  );
  if (wide)
    return (
      <div className="a" data-wide="true">
        {header}
        <div className="a-columns">
          <aside className="a-summary">
            {summary}
            {next}
          </aside>
          <div className="a-table">{body}</div>
        </div>
      </div>
    );
  return (
    <div className="stack">
      {header}
      {next}
      {summary}
      {body}
    </div>
  );
}

function CategoryRow({
  c,
  w,
  v,
  coach,
}: {
  c: string;
  w: World;
  v: VariantKey;
  coach: boolean;
}) {
  const has = w.assigned[c] ?? 0;
  const spent = w.spent[c] ?? 0;
  const left = has - spent;
  const state = left < 0 ? "overspent" : left === 0 ? "zero" : "funded";
  return (
    <li className="a-row" data-state={state} data-coach={coach}>
      <span className="tile" aria-hidden>
        {c[0]}
      </span>
      <div className="a-row-body">
        <div className="split">
          <span className="a-name">{c}</span>
          <span className="pill num" data-state={state}>
            {fmt(w, left)}
          </span>
        </div>
        <span className="bar" data-over={left < 0} aria-hidden>
          <i
            style={{
              width: `${has > 0 ? Math.min(spent / has, 1) * 100 : spent > 0 ? 100 : 0}%`,
            }}
          />
        </span>
        {left < 0 ? (
          <p className="note note-over small">
            Overspent by {fmt(w, -left)}{" "}
            <Hint term="overspent" w={w} v={v} label="Overspent" />
            <button type="button" className="link">
              Cover it
            </button>
          </p>
        ) : has === 0 ? (
          <p className="note muted small">Nothing assigned yet</p>
        ) : (
          <p className="note muted small num">
            {fmt(w, spent)} of {fmt(w, has)} spent
          </p>
        )}
      </div>
    </li>
  );
}

function CategoryTableRow({ c, w, v }: { c: string; w: World; v: VariantKey }) {
  const has = w.assigned[c] ?? 0;
  const spent = w.spent[c] ?? 0;
  const left = has - spent;
  const state = left < 0 ? "overspent" : left === 0 ? "zero" : "funded";
  return (
    <li className="a-trow" data-state={state}>
      <span className="a-tname">
        <span className="tile" aria-hidden>
          {c[0]}
        </span>
        <span className="a-name">{c}</span>
      </span>
      <span className="num">
        <button type="button" className="a-assigned">
          {fmt(w, has)}
        </button>
      </span>
      <span className="a-tspent">
        <span className="bar" data-over={left < 0} aria-hidden>
          <i
            style={{
              width: `${has > 0 ? Math.min(spent / has, 1) * 100 : spent > 0 ? 100 : 0}%`,
            }}
          />
        </span>
        <span className="num muted">{fmt(w, spent)}</span>
      </span>
      <span className="a-tavail">
        <span className="pill num" data-state={state}>
          {fmt(w, left)}
        </span>
        {left < 0 && (
          <>
            <Hint term="overspent" w={w} v={v} label="Overspent" />
            <button type="button" className="link small">
              Cover
            </button>
          </>
        )}
      </span>
    </li>
  );
}

function NextStep({ w, act }: { w: World; act: Act }) {
  const hasAccount = w.accounts.length > 0;
  const hasCategories = w.groups.length > 0;
  const hasAssigned = assignedTotal(w) > 0;
  const hasRecorded = w.transactions.length > 0;
  if (hasAccount && hasCategories && hasAssigned && hasRecorded) return null;
  const steps: {
    label: string;
    done: boolean;
    ready: boolean;
    button: string;
    run(): void;
  }[] = [
    {
      label: "Add the Account you use most",
      done: hasAccount,
      ready: true,
      button: "Add",
      run: () => act.sheet("account"),
    },
    {
      label: "Choose your Categories",
      done: hasCategories,
      ready: true,
      button: "Choose",
      run: () => act.sheet("categories"),
    },
    {
      label: "Give your money its jobs",
      done: hasAssigned,
      ready: hasAccount && hasCategories,
      button: "Assign",
      run: act.assign,
    },
    {
      label: "Record your next purchase",
      done: hasRecorded,
      ready: hasAssigned,
      button: "Record",
      run: act.record,
    },
  ];
  const current = steps.find((s) => !s.done);
  return (
    <section className="card fr-next" aria-label="Next steps">
      <p className="small" style={{ fontWeight: 650 }}>
        Next step
      </p>
      {steps.map((s) => (
        <div
          key={s.label}
          className="fr-step"
          data-done={s.done}
          data-waiting={!s.done && !s.ready}
        >
          <span>{s.label}</span>
          {s === current && (
            <button type="button" className="btn btn-primary" onClick={s.run}>
              {s.button}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function NoCategories({ w, v, act }: { w: World; v: VariantKey; act: Act }) {
  const [picked, setPicked] = useState<string[]>([]);
  if (v === "A")
    return (
      <section className="card fr-empty">
        <h2>No Categories yet</h2>
        <p className="muted">
          A Category is a job for your money, like Rent or Groceries.
        </p>
        <div className="fr-empty-actions">
          <button type="button" className="btn btn-primary">
            Add a Category
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => act.update({ groups: starterSet })}
          >
            Use the starter set
          </button>
        </div>
      </section>
    );
  if (v === "B")
    return (
      <section className="fr-example" aria-label="Example">
        <span className="fr-example-tag">Example</span>
        <ul className="card">
          {[
            ["Rent", 1200, 0],
            ["Groceries", 412.4, 187.6],
          ].map(([name, left, spent]) => (
            <li key={name} className="a-row" data-state="funded">
              <span className="tile" aria-hidden>
                {String(name)[0]}
              </span>
              <div className="a-row-body">
                <div className="split">
                  <span className="a-name">{name}</span>
                  <span className="pill num">{fmt(w, Number(left))}</span>
                </div>
                <span className="bar" aria-hidden>
                  <i
                    style={{
                      width: `${(Number(spent) / (Number(left) + Number(spent))) * 100}%`,
                    }}
                  />
                </span>
                <p className="note muted small num">
                  {fmt(w, Number(spent))} of{" "}
                  {fmt(w, Number(left) + Number(spent))} spent
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  const suggestions = starterSet.flatMap((g) => g.categories);
  return (
    <section className="stack">
      <p className="fr-coach">
        What do you spend money on? Tap what fits, and each becomes a Category:
        a job for your money.
      </p>
      <div className="fr-chips">
        {suggestions.map((c) => (
          <button
            key={c}
            type="button"
            className="fr-chip"
            aria-pressed={picked.includes(c)}
            onClick={() =>
              setPicked(
                picked.includes(c)
                  ? picked.filter((x) => x !== c)
                  : [...picked, c],
              )
            }
          >
            {c}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-wide"
        disabled={picked.length === 0}
        onClick={() =>
          act.update({
            groups: starterSet
              .map((g) => ({
                ...g,
                categories: g.categories.filter((c) => picked.includes(c)),
              }))
              .filter((g) => g.categories.length > 0),
          })
        }
      >
        Add {picked.length === 1 ? "1 Category" : `${picked.length} Categories`}
      </button>
    </section>
  );
}

/* ------------------------------ Activity ---------------------------- */

function Activity({ w, v, act }: Props) {
  const none = w.accounts.length === 0;
  const noTx = w.transactions.length === 0;
  const message = none
    ? {
        A: "Nothing here yet. Add an Account, and everything that moves through it shows up here.",
        B: "This is every dollar in and out, across all your Accounts.",
        C: "Your Accounts' history will read here, Month by Month.",
      }[v]
    : {
        A: "Nothing recorded yet. Record what you spend, and it shows up here.",
        B: "Record your next purchase, and you'll see what's left for it.",
        C: "That's your Opening Balance. Record a Transaction when you next buy something; it takes about ten seconds.",
      }[v];
  return (
    <div className="stack">
      <h1 className="title">Activity</h1>
      {!none && v === "C" && noTx && <p className="fr-coach">{message}</p>}
      {w.transactions.length > 0 && <p className="muted small">October 2026</p>}
      {!none && (
        <ul className="card">
          {w.transactions.map((t) => (
            <li key={`${t.payee}${t.amount}`} className="fr-row">
              <span className="tile" aria-hidden>
                {t.payee[0]}
              </span>
              <span className="fr-row-body">
                {t.payee}
                <br />
                <span className="muted small">
                  {t.category}, {w.accounts[0].name}
                </span>
              </span>
              <span className="num">{fmt(w, -t.amount)}</span>
            </li>
          ))}
          {w.accounts.map((a) => (
            <li key={a.id} className="fr-row">
              <span className="tile" aria-hidden>
                ★
              </span>
              <span className="fr-row-body">
                Opening Balance
                <br />
                <span className="muted small">Ready to Assign, {a.name}</span>
              </span>
              <span className="num">{fmt(w, a.opening)}</span>
            </li>
          ))}
        </ul>
      )}
      {none && v === "B" && (
        <section className="fr-example" aria-label="Example">
          <span className="fr-example-tag">Example</span>
          <ul className="card">
            <li className="fr-row">
              <span className="tile" aria-hidden>
                F
              </span>
              <span className="fr-row-body">
                Fresh Market
                <br />
                <span className="muted small">Groceries, Everyday</span>
              </span>
              <span className="num">{fmt(w, -18.5)}</span>
            </li>
          </ul>
        </section>
      )}
      {(none || (noTx && v !== "C")) && (
        <section className="card fr-empty">
          {v === "A" && none && <h2>Nothing here yet</h2>}
          <p className="muted">{message}</p>
          <div className="fr-empty-actions">
            {none ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => act.sheet("account")}
              >
                Add an Account
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={act.record}
              >
                Record a Transaction
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------ Accounts ---------------------------- */

function Accounts({ w, v, act }: Props) {
  const none = w.accounts.length === 0;
  const money = total(w);
  const update = (id: string, change: Partial<Account>) =>
    act.update({
      accounts: w.accounts.map((a) => (a.id === id ? { ...a, ...change } : a)),
    });
  return (
    <div className="stack">
      <header className="split">
        <h1 className="title">Accounts</h1>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => act.sheet("account")}
        >
          Add
        </button>
      </header>
      {none ? (
        <>
          {v === "B" && (
            <section className="fr-example" aria-label="Example">
              <span className="fr-example-tag">Example</span>
              <div className="card fr-account">
                <div className="split">
                  <b>Everyday</b>
                  <b className="num">{fmt(w, 2400)}</b>
                </div>
                <span className="muted small">Checked Oct 18</span>
              </div>
            </section>
          )}
          <section className="card fr-empty">
            {v === "A" && <h2>No Accounts yet</h2>}
            <p className="muted">
              {
                {
                  A: "An Account is somewhere you keep money you could spend soon: checking, savings or cash.",
                  B: "Add your checking, savings and cash. Leave out investments and debts: budjet doesn't track them.",
                  C: "Start with where your pay lands. What it holds today becomes money you can give jobs to.",
                }[v]
              }
            </p>
            <div className="fr-empty-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => act.sheet("account")}
              >
                Add an Account
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="hero rta">
            <span className="hero-label">Money in your Accounts</span>
            <span className="display num" style={{ fontSize: 40 }}>
              {fmt(w, money)}
            </span>
            <span className="hero-muted small">
              Every dollar here is in your Budget.
            </span>
          </section>
          {w.accounts.map((a) => (
            <section key={a.id} className="card fr-account">
              <div className="split">
                <b>{a.name}</b>
                <b className="num">{fmt(w, a.balance)}</b>
              </div>
              <CheckLine account={a} v={v} />
              <div className="fr-account-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    update(a.id, { checked: TODAY });
                    act.toast(`${a.name} matched your bank. Undo`);
                  }}
                >
                  Matches my bank
                </button>
                <button type="button" className="btn btn-secondary">
                  Update
                </button>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

/** Three answers to "Not checked yet" on a brand-new Account. */
function CheckLine({ account: a, v }: { account: Account; v: VariantKey }) {
  if (a.checked)
    return <span className="muted small">Checked {a.checked}</span>;
  if (v === "A")
    return (
      <span className="muted small">
        Not checked yet. Now and then, see that this matches your bank.
      </span>
    );
  if (v === "B")
    return (
      <span className="muted small">
        Added {TODAY}. Next time you open your bank, see that this matches.
      </span>
    );
  return (
    <span className="muted small">Checked {TODAY}, when you added it</span>
  );
}

/* ------------------------------ sheets ------------------------------ */

function AddAccountSheet({
  w,
  onClose,
  onAdd,
}: {
  w: World;
  onClose(): void;
  onAdd(a: Account): void;
}) {
  const [value, setValue] = useState({
    name: "",
    kind: "Checking" as Kind,
    holds: "",
  });
  return (
    <div className="fr-scrim">
      <div className="fr-dialog" role="dialog" aria-label="Add Account">
        <h2 className="title" style={{ fontSize: 22 }}>
          Add {w.accounts.length === 0 ? "your first " : "an "}Account
        </h2>
        <AccountFields value={value} onChange={setValue} />
        <p className="muted small">
          This is its Opening Balance. It goes to Ready to Assign, for you to
          give every dollar a job.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-wide"
          onClick={() => onAdd(toAccount(value))}
        >
          Add Account
        </button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CategoriesSheet({
  onClose,
  onPick,
}: {
  onClose(): void;
  onPick(groups: Group[]): void;
}) {
  return (
    <div className="fr-scrim">
      <div className="fr-dialog" role="dialog" aria-label="Categories">
        <h2 className="title" style={{ fontSize: 22 }}>
          Choose your Categories
        </h2>
        <p className="muted">
          A Category is a job for your money. You can rename, hide or add to
          these any time.
        </p>
        <button
          type="button"
          className="fr-choice"
          onClick={() => onPick(starterSet)}
        >
          <b>Use the starter set</b>
          <span className="muted small">
            {starterSet.flatMap((g) => g.categories).join(", ")}
          </span>
        </button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ navigation -------------------------- */

function Rail({ w, place, act }: { w: World; place: string; act: Act }) {
  const link = (to: string, label: ReactNode) => (
    <a
      className="rail-item"
      aria-current={place === to ? "page" : undefined}
      href={`?place=${to}`}
      onClick={(e) => {
        e.preventDefault();
        act.go(to);
      }}
    >
      {label}
    </a>
  );
  return (
    <nav className="rail" aria-label="Places">
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={act.record}
      >
        + Record
      </button>
      {link("budget", "Budget")}
      <p className="rail-head muted small">Accounts</p>
      {link(
        "activity",
        <>
          <span>All Accounts</span>
          <span className="num muted small">{fmt(w, total(w))}</span>
        </>,
      )}
      {w.accounts.map((a) => (
        <span key={a.id}>
          {link(
            "accounts",
            <>
              <span>{a.name}</span>
              <span className="num muted small">{fmt(w, a.balance)}</span>
            </>,
          )}
        </span>
      ))}
      <button
        type="button"
        className="link rail-add small"
        onClick={() => act.sheet("account")}
      >
        + Add Account
      </button>
    </nav>
  );
}

function TabBar({ place, act }: { place: string; act: Act }) {
  const tab = (to: string, label: string) => (
    <button
      type="button"
      className="tab ac-tab"
      style={{ border: 0, background: "none", cursor: "pointer" }}
      aria-current={place === to ? "page" : undefined}
      onClick={() => act.go(to)}
    >
      {label}
    </button>
  );
  return (
    <nav className="tabs" aria-label="Places">
      {tab("budget", "Budget")}
      {tab("activity", "Activity")}
      <button
        type="button"
        className="record"
        aria-label="Record"
        onClick={act.record}
      >
        +
      </button>
      {tab("accounts", "Accounts")}
    </nav>
  );
}
