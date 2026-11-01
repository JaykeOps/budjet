// PROTOTYPE (prototype/visual-language): throwaway. Three candidate visual
// languages, switchable via `?variant=A|B|C`. Each shows the Budget screen and
// the New Transaction screen on a phone, then the parts they are made of.
// `?scheme=both` (default) stacks dark over light; `system`, `dark` and
// `light` show one. `?depth=deep` (default) adds shadows, gradients and
// buttons you press down; `flat` takes them away to compare.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/gabarito";
import "@fontsource-variable/geist";
import "@fontsource-variable/schibsted-grotesk";
import { type CSSProperties, useEffect, useState } from "react";
import { useUrlParameter } from "../url-parameter";
import "./prototype.css";
import {
  contrast,
  pairings,
  type Scheme,
  type Shape,
  type Variant,
  variants,
} from "./tokens";

type Key = keyof typeof variants;
const keys = Object.keys(variants) as Key[];
const schemes = ["both", "system", "dark", "light"] as const;
const depths = ["deep", "flat"] as const;

export function VisualLanguagePrototype() {
  const [variant, setVariant] = useUrlParameter("variant");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const key: Key = keys.includes(variant as Key) ? (variant as Key) : "A";
  const scheme = schemes.find((s) => s === schemeParam) ?? "both";
  const [depthParam, setDepth] = useUrlParameter("depth");
  const depth = depths.find((d) => d === depthParam) ?? "deep";
  const systemDark = useSystemDark();
  const v = variants[key];

  function cycle(by: number) {
    setVariant(
      keys[(keys.indexOf(key) + by + keys.length) % keys.length],
      "replace",
    );
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const shown: ("dark" | "light")[] =
    scheme === "both"
      ? ["dark", "light"]
      : scheme === "system"
        ? [systemDark ? "dark" : "light"]
        : [scheme];

  return (
    <>
      {shown.map((s) => (
        <Specimen key={`${key}-${s}`} variant={v} scheme={s} depth={depth} />
      ))}
      {import.meta.env.DEV && (
        <div className="p-switcher">
          <button
            type="button"
            onClick={() => cycle(-1)}
            aria-label="Previous variant"
          >
            ←
          </button>
          <span>
            {key} ({v.name})
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
            <option value="both">Dark + light</option>
            <option value="system">Follow system</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value, "replace")}
            aria-label="Depth"
          >
            <option value="deep">Deep</option>
            <option value="flat">Flat</option>
          </select>
        </div>
      )}
    </>
  );
}

function useSystemDark(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setDark(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return dark;
}

function cssVariables(s: Scheme, shape: Shape): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(s))
    vars[`--${kebab(name)}`] = value;
  vars["--font"] = shape.font;
  vars["--radius-control"] = shape.radiusControl;
  vars["--radius-card"] = shape.radiusCard;
  return vars as CSSProperties;
}

const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => usd.format(n).replace("-", "−");

type Category = { name: string; spent: number; given: number };

// `given` is what the Category had to spend this Month: carried forward plus
// the Assignment. Available = given − Spending.
const groups: { name: string; categories: Category[] }[] = [
  {
    name: "Everyday",
    categories: [
      { name: "Groceries", spent: 412.4, given: 600 },
      { name: "Dining out", spent: 276, given: 300 },
      { name: "Shopping", spent: 268, given: 250 },
      { name: "Fun", spent: 64, given: 200 },
    ],
  },
  {
    name: "Bills",
    categories: [
      { name: "Rent", spent: 1400, given: 1400 },
      { name: "Internet", spent: 0, given: 55 },
    ],
  },
];

function Specimen({
  variant: v,
  scheme,
  depth,
}: {
  variant: Variant;
  scheme: "dark" | "light";
  depth: "deep" | "flat";
}) {
  const s = v[scheme];
  return (
    <section
      className="vl"
      data-scheme={scheme}
      data-depth={depth}
      data-variant={v.name.toLowerCase()}
      data-meter={v.shape.meter}
      data-tile={v.shape.tile}
      style={cssVariables(s, v.shape)}
      aria-label={`${v.name}, ${scheme}`}
    >
      <header className="vl-intro">
        <p className="vl-muted">
          {v.name},{" "}
          {scheme === "dark" ? "dark (first)" : "light (follows the system)"}
        </p>
        <p className="vl-idea">{v.idea}</p>
      </header>

      <div className="vl-phones">
        <BudgetScreen />
        <TransactionScreen scheme={scheme} />
      </div>

      <Parts scheme={s} />
    </section>
  );
}

function BudgetScreen() {
  const spent = 2536.2;
  const given = 3230;
  return (
    <div className="vl-phone">
      <div className="vl-screen">
        <div className="vl-bar">
          <h1 className="vl-title">Budget</h1>
          <button type="button" className="vl-month">
            November 2026
            <Chevron />
          </button>
        </div>

        <div className="vl-hero">
          <p className="vl-hero-label">Ready to Assign</p>
          <p className="vl-display vl-money">{money(240)}</p>
          <div className="vl-hero-foot">
            <p className="vl-hero-hint">Give these dollars a job.</p>
            <button type="button" className="vl-btn vl-btn-primary">
              Assign
            </button>
          </div>
        </div>

        <div className="vl-spent">
          <div className="vl-split">
            <span>Spent this Month</span>
            <span className="vl-money">
              {money(spent)} <span className="vl-muted">of {money(given)}</span>
            </span>
          </div>
          <Meter spent={spent} given={given} />
          <Sparkline given={given} />
        </div>

        {groups.map((g) => (
          <div key={g.name} className="vl-group">
            <div className="vl-split vl-group-head">
              <h2>{g.name}</h2>
              <span>Available</span>
            </div>
            <ul className="vl-categories">
              {g.categories.map((c) => (
                <CategoryRow key={c.name} category={c} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <nav className="vl-tabs" aria-label="Sample tab bar">
        <span className="vl-tab" aria-current="page">
          <TabIcon kind="budget" />
          Budget
        </span>
        <span className="vl-tab">
          <TabIcon kind="activity" />
          Activity
        </span>
        <button
          type="button"
          className="vl-record"
          aria-label="Record a Transaction"
        >
          <Plus />
        </button>
        <span className="vl-tab">
          <TabIcon kind="accounts" />
          Accounts
        </span>
      </nav>
    </div>
  );
}

function CategoryRow({ category: c }: { category: Category }) {
  const available = c.given - c.spent;
  const left = c.given === 0 ? 0 : Math.max(0, available / c.given);
  const state =
    available < 0 ? "overspent" : available === 0 ? "zero" : "available";
  return (
    <li
      className="vl-category"
      data-state={state}
      style={{ "--left": `${left * 100}%` } as CSSProperties}
    >
      <span className="vl-tile-wrap">
        <Ring spent={c.spent} given={c.given} />
        <Tile name={c.name} />
      </span>
      <div className="vl-category-body">
        <div className="vl-split">
          <span className="vl-category-name">{c.name}</span>
          <span className="vl-available vl-money">{money(available)}</span>
        </div>
        <Meter spent={c.spent} given={c.given} />
        <p className="vl-category-note vl-money">
          {state === "overspent"
            ? `Overspent by ${money(-available)}`
            : `${money(c.spent)} of ${money(c.given)} spent`}
        </p>
      </div>
    </li>
  );
}

function TransactionScreen({ scheme }: { scheme: string }) {
  const chips = ["Groceries", "Dining out", "Shopping", "Fun", "Rent"];
  return (
    <div className="vl-phone">
      <div className="vl-screen">
        <div className="vl-bar">
          <button type="button" className="vl-link">
            Cancel
          </button>
          <h1 className="vl-sheet-title">New Transaction</h1>
          <span className="vl-bar-spacer" />
        </div>

        <div className="vl-segmented" role="radiogroup" aria-label="Direction">
          <label>
            <input type="radio" name={`dir-${scheme}`} defaultChecked />
            Money out
          </label>
          <label>
            <input type="radio" name={`dir-${scheme}`} />
            Money in
          </label>
        </div>

        <p className="vl-amount vl-money">{money(-18.5)}</p>

        <div className="vl-fields">
          <label className="vl-field">
            <span>Payee</span>
            <input className="vl-input" defaultValue="Corner Bistro" />
          </label>
          <div className="vl-field-pair">
            <label className="vl-field">
              <span>Account</span>
              <select className="vl-input">
                <option>Checking</option>
                <option>Cash</option>
              </select>
            </label>
            <label className="vl-field">
              <span>Date</span>
              <input className="vl-input" defaultValue="Today" />
            </label>
          </div>
        </div>

        <fieldset className="vl-chips">
          <legend>Category</legend>
          {chips.map((name) => (
            <label key={name} className="vl-chip">
              <input
                type="radio"
                name={`cat-${scheme}`}
                defaultChecked={name === "Dining out"}
              />
              {name}
            </label>
          ))}
        </fieldset>

        <p className="vl-after">
          Dining out will have{" "}
          <strong className="vl-money">{money(5.5)}</strong> left this Month.
        </p>

        <button type="button" className="vl-btn vl-btn-primary vl-btn-wide">
          Save Transaction
        </button>
      </div>
    </div>
  );
}

function Parts({ scheme: s }: { scheme: Scheme }) {
  const results = pairings.map((p) => ({
    ...p,
    ratio: contrast(s[p.fg], s[p.bg]),
  }));
  const failing = results.filter((r) => r.ratio < r.min);
  const swatches: [keyof Scheme, string][] = [
    ["bg", "Page"],
    ["surface", "Card"],
    ["raised", "Raised"],
    ["text", "Text"],
    ["muted", "Muted"],
    ["accent", "Action"],
    ["hero", "Ready to Assign"],
    ["positive", "Available"],
    ["negative", "Overspent"],
  ];
  return (
    <div className="vl-parts">
      <div className="vl-part">
        <h2>Colour</h2>
        <ul className="vl-swatches">
          {swatches.map(([token, label]) => (
            <li key={token}>
              <span className="vl-swatch" style={{ background: s[token] }} />
              <span>{label}</span>
              <code>{s[token]}</code>
            </li>
          ))}
        </ul>
      </div>

      <div className="vl-part">
        <h2>Type</h2>
        <p className="vl-display vl-money">$4,560.00</p>
        <p className="vl-title">Budget</p>
        <p className="vl-sheet-title">Spent this Month</p>
        <p>Groceries had $600.00 to spend this Month.</p>
        <p className="vl-muted">$412.40 of $600.00 spent</p>
        <p className="vl-money vl-figures">
          $1,111.11
          <br />
          $8,888.88
        </p>
      </div>

      <div className="vl-part">
        <h2>Controls</h2>
        <div className="vl-wrap">
          <button type="button" className="vl-btn vl-btn-primary">
            Assign
          </button>
          <button type="button" className="vl-btn vl-btn-secondary">
            Move money
          </button>
          <button type="button" className="vl-btn vl-btn-quiet">
            Copy last Month
          </button>
        </div>
        <div className="vl-wrap">
          <button type="button" className="vl-btn vl-btn-danger">
            Delete Account
          </button>
          <button type="button" className="vl-btn vl-btn-primary" disabled>
            Assign
          </button>
          <button type="button" className="vl-btn vl-btn-primary is-pressed">
            Pressed
          </button>
          <button type="button" className="vl-btn vl-btn-primary is-focused">
            Focused
          </button>
        </div>
        <label className="vl-check-row">
          <input type="checkbox" className="vl-check" defaultChecked />
          Show hidden Categories
        </label>
      </div>

      <div className="vl-part">
        <h2>Money</h2>
        <div className="vl-wrap">
          <span className="vl-pill" data-state="available">
            {money(188)}
          </span>
          <span className="vl-pill" data-state="zero">
            {money(0)}
          </span>
          <span className="vl-pill" data-state="overspent">
            {money(-18)}
          </span>
        </div>
        <p className="vl-money">
          <span className="vl-out">{money(-64.18)}</span> Trader Joe’s
          <br />
          <span className="vl-in">+{money(2400)}</span> Paycheck
        </p>
        <p className={failing.length === 0 ? "vl-pass" : "vl-fail"}>
          {failing.length === 0
            ? `All ${results.length} colour pairs meet WCAG 2.2 AA.`
            : `${failing.length} of ${results.length} pairs fail AA: ${failing
                .map((f) => `${f.label} ${f.ratio.toFixed(2)}`)
                .join(", ")}`}
        </p>
        <details className="vl-audit">
          <summary>Contrast ratios</summary>
          <table>
            <tbody>
              {results.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="vl-money">{r.ratio.toFixed(2)}</td>
                  <td>≥ {r.min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}

function Tile({ name }: { name: string }) {
  return (
    <span className="vl-tile" aria-hidden>
      {name[0]}
    </span>
  );
}

// Spending, ringed round a Category's icon: where the meter is "ring".
function Ring({ spent, given }: { spent: number; given: number }) {
  const used = given === 0 ? 0 : Math.min(spent / given, 1);
  const r = 21;
  const length = 2 * Math.PI * r;
  return (
    <svg
      className="vl-ring"
      data-over={spent > given}
      viewBox="0 0 48 48"
      aria-hidden
    >
      <circle className="vl-ring-track" cx="24" cy="24" r={r} />
      <circle
        className="vl-ring-fill"
        cx="24"
        cy="24"
        r={r}
        strokeDasharray={`${used * length} ${length}`}
      />
    </svg>
  );
}

// Spending so far this Month, day by day (today is the 20th), against an
// even pace that would land on what the Month has to spend.
const daily = [
  1430, 1452, 1490, 1531, 1540, 1612, 1655, 1690, 1734, 1790, 1868, 1902, 1955,
  2050, 2110, 2187, 2260, 2340, 2448, 2536.2,
];

function Sparkline({ given }: { given: number }) {
  const w = 320;
  const h = 72;
  const x = (day: number) => (day / 29) * w;
  const y = (amount: number) => h - 4 - (amount / given) * (h - 8);
  const line = daily
    .map(
      (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
    )
    .join(" ");
  const last = daily.length - 1;
  return (
    <svg className="vl-sparkline" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path
        className="vl-spark-area"
        d={`${line} L${x(last)},${h} L0,${h} Z`}
      />
      <path className="vl-spark-pace" d={`M0,${y(0)} L${w},${y(given)}`} />
      <path className="vl-spark-line" d={line} />
      <circle className="vl-spark-dot" cx={x(last)} cy={y(daily[last])} r="4" />
    </svg>
  );
}

function Meter({ spent, given }: { spent: number; given: number }) {
  const used = given === 0 ? 0 : spent / given;
  const over = used > 1;
  return (
    // The figures beside every meter carry the same information.
    <div className="vl-meter" data-over={over} aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed segments
          key={i}
          data-on={i < Math.round(Math.min(used, 1) * 10)}
        />
      ))}
      <i style={{ width: `${Math.min(used, 1) * 100}%` }} />
    </div>
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
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path
        d="M11 4v14M4 11h14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TabIcon({ kind }: { kind: "budget" | "activity" | "accounts" }) {
  const d = {
    budget: "M4 5h14M4 11h9M4 17h11",
    activity: "M3 12h4l3-7 4 14 3-7h3",
    accounts: "M3 8h16v10H3zM3 8l3-4h10l3 4M14 13h2",
  }[kind];
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
