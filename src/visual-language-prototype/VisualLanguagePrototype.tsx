// PROTOTYPE (prototype/visual-language): throwaway. Three candidate visual
// languages, switchable via `?variant=A|B|C`, each shown as one specimen of
// tokens and base components. `?scheme=both` (default) puts dark and light side
// by side; `system`, `dark` and `light` show one column.
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

export function VisualLanguagePrototype() {
  const [variant, setVariant] = useUrlParameter("variant");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const key: Key = keys.includes(variant as Key) ? (variant as Key) : "A";
  const scheme = schemes.find((s) => s === schemeParam) ?? "both";
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
      <div className="vl-stage" data-columns={shown.length}>
        {shown.map((s) => (
          <Specimen key={s} variant={v} scheme={s} />
        ))}
      </div>
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
  vars["--radius-control"] = shape.radiusControl;
  vars["--radius-card"] = shape.radiusCard;
  vars["--radius-pill"] = shape.radiusPill;
  vars["--meter-height"] = shape.meterHeight;
  return vars as CSSProperties;
}

const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Placeholder Category tiles (user-chosen icons are out of scope): one hue per
// Category, with a bright and a deep shade for dark and light schemes.
const tiles = [
  { name: "Rent", hue: ["#f3b84f", "#8f5200"] },
  { name: "Groceries", hue: ["#4fd68a", "#14773a"] },
  { name: "Dining out", hue: ["#6ea2ff", "#1d5ae0"] },
  { name: "Transport", hue: ["#b39cff", "#6a3fd1"] },
  { name: "Shopping", hue: ["#ff8fb0", "#b8295a"] },
  { name: "Fun", hue: ["#4fd8d0", "#0d7670"] },
] as const;

function Specimen({
  variant: v,
  scheme,
}: {
  variant: Variant;
  scheme: "dark" | "light";
}) {
  const s = v[scheme];
  const shade = (hue: readonly [string, string]) =>
    scheme === "dark" ? hue[0] : hue[1];

  return (
    <section
      className="vl"
      data-scheme={scheme}
      data-border={v.shape.cardBorder}
      data-density={v.shape.density}
      data-tile={v.shape.tile}
      style={cssVariables(s, v.shape)}
    >
      <header className="vl-head">
        <p className="vl-caption">
          {scheme === "dark" ? "Dark (first)" : "Light (follows system)"}
        </p>
        <h1 className="vl-title">{v.name}</h1>
        <p className="vl-muted">{v.idea}</p>
      </header>

      <h2 className="vl-h">In use</h2>
      <div className="vl-phone">
        <div className="vl-row-between">
          <h1 className="vl-title">Budget</h1>
          <select className="vl-select" aria-label="Month">
            <option>November 2026</option>
            <option>October 2026</option>
          </select>
        </div>

        <div className="vl-card">
          <p className="vl-caption">Ready to Assign</p>
          <p className="vl-display vl-money">$240.00</p>
          <p className="vl-muted">Give these dollars a job.</p>
          <div className="vl-row">
            <button type="button" className="vl-btn vl-btn-primary">
              Assign
            </button>
            <button type="button" className="vl-btn vl-btn-secondary">
              Move Money
            </button>
          </div>
        </div>

        <div className="vl-card">
          <div className="vl-row-between">
            <p className="vl-heading">Spent this Month</p>
            <span className="vl-pill vl-pill-pos">$694 left</span>
          </div>
          <p className="vl-money vl-heading">
            $2,536 <span className="vl-muted">/ $3,230</span>
          </p>
          <Meter used={0.79} tone="fill" />
        </div>

        <p className="vl-caption vl-group">Everyday</p>
        <div className="vl-card vl-list">
          <CategoryRow
            tile={tiles[1]}
            shade={shade}
            spent={412}
            of={600}
            available="$188.00"
            tone="pos"
          />
          <CategoryRow
            tile={tiles[2]}
            shade={shade}
            spent={276}
            of={300}
            available="$24.00"
            tone="near"
          />
          <CategoryRow
            tile={tiles[4]}
            shade={shade}
            spent={268}
            of={250}
            available="−$18.00"
            tone="neg"
          />
          <CategoryRow
            tile={tiles[5]}
            shade={shade}
            spent={0}
            of={0}
            available="$0.00"
            tone="zero"
          />
        </div>

        <nav className="vl-tabbar" aria-label="Sample tab bar">
          <span className="vl-tab" aria-current="page">
            Budget
          </span>
          <span className="vl-tab">Activity</span>
          <span className="vl-plus" aria-hidden>
            +
          </span>
          <span className="vl-tab">Accounts</span>
        </nav>
      </div>

      <h2 className="vl-h">Colour</h2>
      <div className="vl-swatches">
        {(Object.keys(s) as (keyof Scheme)[]).map((name) => (
          <div key={name} className="vl-swatch">
            <span style={{ background: s[name] }} />
            <code>{kebab(name)}</code>
            <code className="vl-muted">{s[name]}</code>
          </div>
        ))}
      </div>
      <div className="vl-tiles">
        {tiles.map((t) => (
          <div key={t.name} className="vl-row">
            <Tile hue={shade(t.hue)} name={t.name} />
            <span>{t.name}</span>
          </div>
        ))}
      </div>

      <h2 className="vl-h">Type</h2>
      <div className="vl-stack">
        <p className="vl-display vl-money">$4,560.00</p>
        <p className="vl-title">Title · Budget</p>
        <p className="vl-heading">Heading · Spent this Month</p>
        <p>Body · Groceries had $600 assigned this Month.</p>
        <p className="vl-muted">Muted · carried forward from October</p>
        <p className="vl-caption">Caption · Ready to Assign</p>
        <p className="vl-money">Tabular figures · $1,111.11 / $8,888.88</p>
      </div>

      <h2 className="vl-h">Spacing and radii</h2>
      <div className="vl-row vl-wrap">
        {[4, 8, 12, 16, 24, 32].map((n) => (
          <div key={n} className="vl-space">
            <span style={{ width: n, height: n }} />
            <code>{n}</code>
          </div>
        ))}
      </div>
      <div className="vl-row vl-wrap">
        <div
          className="vl-radius"
          style={{ borderRadius: "var(--radius-pill)" }}
        >
          pill {v.shape.radiusPill}
        </div>
        <div
          className="vl-radius"
          style={{ borderRadius: "var(--radius-control)" }}
        >
          control {v.shape.radiusControl}
        </div>
        <div
          className="vl-radius"
          style={{ borderRadius: "var(--radius-card)" }}
        >
          card {v.shape.radiusCard}
        </div>
      </div>

      <h2 className="vl-h">Surfaces</h2>
      <div className="vl-surfaces">
        <div style={{ background: "var(--bg)" }}>page</div>
        <div className="vl-card">card</div>
        <div className="vl-card" style={{ background: "var(--raised)" }}>
          raised
        </div>
      </div>

      <h2 className="vl-h">Controls</h2>
      <div className="vl-stack">
        <div className="vl-row vl-wrap">
          <button type="button" className="vl-btn vl-btn-primary">
            Save Transaction
          </button>
          <button type="button" className="vl-btn vl-btn-secondary">
            Cancel
          </button>
          <button type="button" className="vl-btn vl-btn-quiet">
            Copy last Month
          </button>
          <button type="button" className="vl-btn vl-btn-danger">
            Close Account
          </button>
          <button type="button" className="vl-btn vl-btn-primary" disabled>
            Disabled
          </button>
        </div>
        <div className="vl-row vl-wrap">
          <button type="button" className="vl-btn vl-btn-primary is-focused">
            Focused
          </button>
          <button type="button" className="vl-btn vl-btn-secondary is-focused">
            Focused
          </button>
          <span className="vl-muted">
            Tab through this column for live rings.
          </span>
        </div>
        <label className="vl-field">
          <span className="vl-caption">Payee</span>
          <input className="vl-input" defaultValue="Corner Bistro" />
        </label>
        <label className="vl-field">
          <span className="vl-caption">Amount</span>
          <input
            className="vl-input vl-money vl-amount"
            defaultValue="−18.50"
            inputMode="decimal"
          />
        </label>
        <label className="vl-field">
          <span className="vl-caption">Category</span>
          <select className="vl-select">
            <option>Dining out</option>
            <option>Groceries</option>
          </select>
        </label>
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
        <label className="vl-row">
          <input type="checkbox" className="vl-check" defaultChecked />
          Show hidden Categories
        </label>
      </div>

      <h2 className="vl-h">Money states</h2>
      <div className="vl-row vl-wrap">
        <span className="vl-pill vl-pill-pos">$188.00</span>
        <span className="vl-pill vl-pill-zero">$0.00</span>
        <span className="vl-pill vl-pill-neg">−$18.00</span>
        <span className="vl-money" style={{ color: "var(--negative)" }}>
          −$64.18
        </span>
        <span className="vl-money" style={{ color: "var(--positive)" }}>
          +$2,400.00
        </span>
        <span style={{ color: "var(--warning)" }}>Nearly there · $24 left</span>
      </div>
      <div className="vl-stack">
        <Meter used={0.53} tone="fill" />
        <Meter used={0.92} tone="near" />
        <Meter used={1} tone="over" />
      </div>

      <h2 className="vl-h">Contrast (WCAG 2.2 AA)</h2>
      <table className="vl-audit">
        <tbody>
          {pairings.map((p) => {
            const ratio = contrast(s[p.fg], s[p.bg]);
            return (
              <tr key={p.label}>
                <td>
                  <span
                    className="vl-chip"
                    style={{
                      color: s[p.fg],
                      background: s[p.bg],
                      borderColor: s[p.fg],
                    }}
                  >
                    Aa
                  </span>
                </td>
                <td>{p.label}</td>
                <td className="vl-money">{ratio.toFixed(2)}</td>
                <td className={ratio >= p.min ? "vl-pass" : "vl-fail"}>
                  {ratio >= p.min ? "pass" : "FAIL"} ≥{p.min}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {scheme === "dark" && (
        <details className="vl-tokens">
          <summary>As tokens with light-dark()</summary>
          <pre>{tokensCss(v)}</pre>
        </details>
      )}
    </section>
  );
}

function CategoryRow({
  tile,
  shade,
  spent,
  of,
  available,
  tone,
}: {
  tile: (typeof tiles)[number];
  shade: (hue: readonly [string, string]) => string;
  spent: number;
  of: number;
  available: string;
  tone: "pos" | "near" | "neg" | "zero";
}) {
  const used = of === 0 ? 0 : spent / of;
  return (
    <div className="vl-category">
      <Tile hue={shade(tile.hue)} name={tile.name} />
      <div className="vl-grow">
        <div className="vl-row-between">
          <span>{tile.name}</span>
          <span className={`vl-pill vl-pill-${tone === "near" ? "pos" : tone}`}>
            {available}
          </span>
        </div>
        <Meter
          used={used}
          tone={tone === "neg" ? "over" : tone === "near" ? "near" : "fill"}
        />
        <p className="vl-caption vl-money">
          ${spent} of ${of}
          {tone === "near" && (
            <span style={{ color: "var(--warning)" }}> · Nearly there</span>
          )}
          {tone === "neg" && (
            <span style={{ color: "var(--negative)" }}> · Overspent</span>
          )}
        </p>
      </div>
    </div>
  );
}

function Tile({ hue, name }: { hue: string; name: string }) {
  return (
    <span
      className="vl-tile"
      style={{ "--hue": hue } as CSSProperties}
      aria-hidden
    >
      {name[0]}
    </span>
  );
}

function Meter({
  used,
  tone,
}: {
  used: number;
  tone: "fill" | "near" | "over";
}) {
  return (
    // The figures beside every meter carry the same information.
    <div className="vl-meter" aria-hidden>
      <span data-tone={tone} style={{ width: `${Math.min(used, 1) * 100}%` }} />
    </div>
  );
}

function tokensCss(v: Variant): string {
  const lines = (Object.keys(v.dark) as (keyof Scheme)[]).map(
    (name) =>
      `  --${kebab(name)}: light-dark(${v.light[name]}, ${v.dark[name]});`,
  );
  return `:root {\n  color-scheme: light dark;\n${lines.join("\n")}\n  --radius-control: ${v.shape.radiusControl};\n  --radius-card: ${v.shape.radiusCard};\n  --radius-pill: ${v.shape.radiusPill};\n}`;
}
