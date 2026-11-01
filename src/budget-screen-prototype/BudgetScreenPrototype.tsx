// PROTOTYPE (prototype/budget-screen): throwaway. Three Budget screens for
// "What does the Budget screen look like?" (#78), in budjet's visual language
// (Card, Soft depth, Graphite Ready to Assign card), switchable via
// `?budget=A|B|C`. `?frame=phone|desktop` picks the device; `?data=` picks the
// Month shown: `typical`, `new` (a newcomer who has assigned nothing yet) or
// `rough` (several Categories Overspent and Ready to Assign below zero).
// `?scheme=system|dark|light`. Everything is in memory; buttons do nothing.
import "@fontsource-variable/geist";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { useUrlParameter } from "../url-parameter";
import "./prototype.css";

type Category = {
  name: string;
  carried: number;
  assigned: number;
  spending: number;
};
type Group = { name: string; categories: Category[] };
type Month = {
  readyToAssign: number;
  groups: Group[];
  /** Spending so far this Month, one figure per day up to today. */
  daily: number[];
};

const variantKeys = ["A", "B", "C"] as const;
type VariantKey = (typeof variantKeys)[number];
const variantNames: Record<VariantKey, string> = {
  A: "List",
  B: "Attention first",
  C: "Envelopes",
};
const dataKeys = ["typical", "new", "rough"] as const;
type DataKey = (typeof dataKeys)[number];

const MONTH = "October 2026";
const TODAY = 22;
const DAYS = 31;

const c = (
  name: string,
  carried: number,
  assigned: number,
  spending: number,
): Category => ({ name, carried, assigned, spending });

const typicalGroups: Group[] = [
  {
    name: "Bills",
    categories: [
      c("Rent", 0, 1400, 1400),
      c("Electricity", 0, 90, 62.18),
      c("Internet", 0, 55, 0),
      c("Phone", 0, 40, 40),
    ],
  },
  {
    name: "Everyday",
    categories: [
      c("Groceries", 40, 560, 412.4),
      c("Dining out", 0, 300, 276),
      c("Transport", 20, 160, 96),
      c("Shopping", 0, 250, 268),
    ],
  },
  {
    name: "Life",
    categories: [
      c("Fun", 36, 164, 64),
      c("Gifts", 0, 0, 25.99),
      c("Subscriptions", 0, 45, 45),
    ],
  },
  {
    name: "Savings",
    categories: [c("Emergency fund", 5000, 330, 0), c("Holiday", 600, 200, 0)],
  },
];

const months: Record<DataKey, Month> = {
  typical: {
    readyToAssign: 240,
    groups: typicalGroups,
    daily: ramp(2689.57),
  },
  new: {
    readyToAssign: 4320,
    groups: typicalGroups.map((g) => ({
      ...g,
      categories: g.categories.map((x) => c(x.name, 0, 0, 0)),
    })),
    daily: [],
  },
  rough: {
    readyToAssign: -85,
    groups: typicalGroups.map((g) => ({
      ...g,
      categories: g.categories.map((x) =>
        x.name === "Dining out"
          ? c(x.name, 0, 300, 342.5)
          : x.name === "Groceries"
            ? c(x.name, 40, 560, 631.2)
            : x.name === "Fun"
              ? c(x.name, -20, 120, 64)
              : x,
      ),
    })),
    daily: ramp(3002.27),
  },
};

function ramp(to: number): number[] {
  return Array.from(
    { length: TODAY },
    (_, i) => to * ((i + 1) / TODAY) ** 0.8 + (i % 3) * 20 - 20,
  ).map((v, i, all) => (i === all.length - 1 ? to : Math.max(0, v)));
}

const had = (x: Category) => x.carried + x.assigned;
const available = (x: Category) => had(x) - x.spending;
const stateOf = (x: Category) =>
  available(x) < 0
    ? "overspent"
    : available(x) === 0
      ? "zero"
      : ("available" as const);

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => usd.format(n).replace("-", "−");

function totals(m: Month) {
  const all = m.groups.flatMap((g) => g.categories);
  return {
    spent: all.reduce((s, x) => s + x.spending, 0),
    // What Spending is measured against: this Month's Assignments to
    // Categories that spend, leaving out the Savings group.
    had: m.groups
      .filter((g) => g.name !== "Savings")
      .flatMap((g) => g.categories)
      .reduce((s, x) => s + x.assigned, 0),
    overspent: all.filter((x) => available(x) < 0),
    assignedAny: all.some((x) => x.assigned !== 0),
  };
}

export function BudgetScreenPrototype() {
  const [variantParam, setVariant] = useUrlParameter("budget");
  const [frameParam, setFrame] = useUrlParameter("frame");
  const [dataParam, setData] = useUrlParameter("data");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const key: VariantKey =
    variantKeys.find((k) => k === variantParam) ?? variantKeys[0];
  const frame =
    frameParam === "phone" || frameParam === "desktop"
      ? frameParam
      : window.innerWidth < 900
        ? "phone"
        : "desktop";
  const data: DataKey = dataKeys.find((d) => d === dataParam) ?? "typical";
  const scheme = schemeParam ?? "dark";
  const month = months[data];

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
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const Variant = { A: VariantA, B: VariantB, C: VariantC }[key];

  return (
    <div className="bs" data-scheme={scheme} data-frame={frame}>
      {frame === "phone" ? (
        <div className="bs-device">
          <div className="bs-phone">
            <Variant month={month} wide={false} key={`${key}-${data}`} />
            <TabBar />
          </div>
        </div>
      ) : (
        <div className="bs-desktop">
          <Rail />
          <main className="bs-main">
            <Variant month={month} wide key={`${key}-${data}`} />
          </main>
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
            value={data}
            onChange={(e) => setData(e.target.value, "replace")}
            aria-label="Month shown"
          >
            <option value="typical">Typical Month</option>
            <option value="new">Newcomer</option>
            <option value="rough">Rough Month</option>
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
        </div>
      )}
    </div>
  );
}

type VariantProps = { month: Month; wide: boolean };

/* ------------------------------------------------------------------ */
/* A. List: the reference design's order, one long list of rows. Wide  */
/* screens pin the summary in a left column and turn rows into a table */
/* with Assigned, Spending and Available columns.                      */
/* ------------------------------------------------------------------ */

function VariantA({ month: m, wide }: VariantProps) {
  const t = totals(m);
  const summary = (
    <>
      <ReadyToAssign amount={m.readyToAssign} newcomer={!t.assignedAny} />
      <SpentCard month={m} chart="line" />
    </>
  );
  return (
    <div className="a" data-wide={wide}>
      <Header wide={wide} />
      {wide ? (
        <div className="a-columns">
          <aside className="a-summary">{summary}</aside>
          <div className="a-table">
            <div className="a-table-head" aria-hidden>
              <span>Category</span>
              <span>Assigned</span>
              <span>Spending</span>
              <span>
                Available <Hint term="available" />
              </span>
            </div>
            {m.groups.map((g) => (
              <section key={g.name} className="a-group card">
                <GroupHead group={g} />
                <ul>
                  {g.categories.map((x) => (
                    <TableRow key={x.name} category={x} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="stack">
          {summary}
          {m.groups.map((g) => (
            <section key={g.name} className="a-group">
              <GroupHead group={g} hint />
              <ul className="card">
                {g.categories.map((x) => (
                  <ListRow key={x.name} category={x} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ListRow({ category: x }: { category: Category }) {
  const state = stateOf(x);
  return (
    <li className="a-row" data-state={state}>
      <Tile name={x.name} />
      <div className="a-row-body">
        <div className="split">
          <span className="a-name">{x.name}</span>
          <Pill category={x} />
        </div>
        <Bar category={x} />
        <Note category={x} />
      </div>
    </li>
  );
}

function TableRow({ category: x }: { category: Category }) {
  const state = stateOf(x);
  return (
    <li className="a-trow" data-state={state}>
      <span className="a-tname">
        <Tile name={x.name} />
        <span>
          <span className="a-name">{x.name}</span>
          {x.carried !== 0 && (
            <span className="a-carried muted small">
              {money(x.carried)} carried forward
            </span>
          )}
        </span>
      </span>
      <span className="num">
        <button type="button" className="a-assigned">
          {money(x.assigned)}
        </button>
      </span>
      <span className="a-tspent">
        <Bar category={x} />
        <span className="num muted">{money(x.spending)}</span>
      </span>
      <span className="a-tavail">
        <Pill category={x} />
        {state === "overspent" && (
          <button type="button" className="link small">
            Cover
          </button>
        )}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* B. Attention first: one summary card, then whatever needs the user  */
/* (Overspent Categories, money to assign), then compact Category      */
/* Groups that fold. Wide screens lay the groups out in columns.       */
/* ------------------------------------------------------------------ */

function VariantB({ month: m, wide }: VariantProps) {
  const t = totals(m);
  return (
    <div className="b" data-wide={wide}>
      <Header wide={wide} />
      <div className="b-top">
        <div className="hero b-hero">
          <div className="b-hero-rta">
            <p className="hero-label">
              Ready to Assign <Hint term="rta" onHero />
            </p>
            <p className="display num">{money(m.readyToAssign)}</p>
            <button type="button" className="btn btn-hero">
              Assign
            </button>
          </div>
          <div className="b-hero-spent">
            <div className="split">
              <span>Spent this Month</span>
              <span className="num">
                {money(t.spent)}{" "}
                <span className="hero-muted">of {money(t.had)} assigned</span>
              </span>
            </div>
            <PaceBar spent={t.spent} had={t.had} onHero />
            <p className="hero-muted small">
              {DAYS - TODAY} days to go. The mark shows an even pace.
            </p>
          </div>
        </div>
        <Attention month={m} />
      </div>
      <div className="b-groups">
        {m.groups.map((g) => (
          <FoldingGroup key={g.name} group={g} />
        ))}
      </div>
    </div>
  );
}

function Attention({ month: m }: { month: Month }) {
  const t = totals(m);
  const items: ReactNode[] = [];
  if (!t.assignedAny)
    items.push(
      <li key="start" className="b-todo">
        <p className="b-todo-title">Give your money a job</p>
        <p className="muted small">
          {money(m.readyToAssign)} is Ready to Assign. Decide how much each
          Category gets this Month, starting with the bills that can’t wait.
        </p>
        <button type="button" className="btn btn-primary">
          Assign money
        </button>
      </li>,
    );
  if (m.readyToAssign < 0)
    items.push(
      <li key="rta" className="b-todo" data-state="overspent">
        <p className="b-todo-title">
          You’ve assigned {money(-m.readyToAssign)} more than you have
        </p>
        <p className="muted small">
          Take it back from a Category with money to spare.
        </p>
      </li>,
    );
  for (const x of t.overspent)
    items.push(
      <li key={x.name} className="b-todo" data-state="overspent">
        <div className="split">
          <p className="b-todo-title">{x.name} is Overspent</p>
          <span className="pill" data-state="overspent">
            {money(available(x))}
          </span>
        </div>
        <p className="muted small">
          {had(x) <= 0
            ? `It spent ${money(x.spending)} with nothing assigned.`
            : `It spent ${money(x.spending)} of ${money(had(x))}.`}{" "}
          Raise its Assignment by {money(-available(x))} to cover it.
        </p>
        <button type="button" className="btn btn-secondary">
          Cover {money(-available(x))}
        </button>
      </li>,
    );
  if (items.length === 0)
    return (
      <p className="b-calm card">
        Every Category has money left and every dollar has a job.
      </p>
    );
  return (
    <section className="b-attention">
      <h2 className="b-attention-head">
        Needs you <span className="count">{items.length}</span>
      </h2>
      <ul>{items}</ul>
    </section>
  );
}

function FoldingGroup({ group: g }: { group: Group }) {
  const sum = g.categories.reduce((s, x) => s + available(x), 0);
  const over = g.categories.filter((x) => available(x) < 0).length;
  return (
    <details className="b-group card" open>
      <summary>
        <Chevron />
        <span className="b-group-name">{g.name}</span>
        {over > 0 && <span className="b-over-count">{over} Overspent</span>}
        <span className="num muted">{money(sum)}</span>
      </summary>
      <ul>
        {g.categories.map((x) => (
          <li key={x.name} className="b-row" data-state={stateOf(x)}>
            <span className="b-name">{x.name}</span>
            <Bar category={x} thin />
            <Pill category={x} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* C. Envelopes: each Category is a tile filled to the money it has    */
/* left. Tapping one opens its sum (carried forward + Assignment −     */
/* Spending = Available), which is how it teaches. Wide screens add a  */
/* side panel for the Month and the chosen Category.                   */
/* ------------------------------------------------------------------ */

function VariantC({ month: m, wide }: VariantProps) {
  const t = totals(m);
  const [chosen, setChosen] = useState<Category | null>(
    wide ? (t.overspent[0] ?? m.groups[1].categories[0]) : null,
  );
  const grid = (
    <div className="c-groups">
      {!t.assignedAny && (
        <p className="c-empty">
          Every Category is empty. Each tile fills up as you give it money, and
          drains as you spend.
        </p>
      )}
      {m.groups.map((g) => (
        <section key={g.name}>
          <h2 className="c-group-head">{g.name}</h2>
          <ul className="c-grid">
            {g.categories.map((x) => (
              <EnvelopeTile
                key={x.name}
                category={x}
                chosen={chosen?.name === x.name}
                onChoose={() => setChosen(x)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
  if (wide)
    return (
      <div className="c" data-wide>
        <Header wide />
        <div className="c-columns">
          {grid}
          <aside className="c-panel">
            <ReadyToAssign amount={m.readyToAssign} newcomer={!t.assignedAny} />
            <SpentCard month={m} chart="line" />
            {chosen && <Breakdown category={chosen} />}
          </aside>
        </div>
      </div>
    );
  return (
    <div className="c">
      <Header wide={false} />
      <div className="c-strip hero">
        <div>
          <p className="hero-label small">Ready to Assign</p>
          <p className="c-strip-amount num">{money(m.readyToAssign)}</p>
        </div>
        <button type="button" className="btn btn-hero">
          Assign
        </button>
      </div>
      <div className="c-spent">
        <div className="split small">
          <span>Spent this Month</span>
          <span className="num">
            {money(t.spent)}{" "}
            <span className="muted">of {money(t.had)} assigned</span>
          </span>
        </div>
        <PaceBar spent={t.spent} had={t.had} />
      </div>
      {grid}
      {chosen && (
        <div className="c-sheet-scrim">
          <div className="c-sheet" role="dialog" aria-label={chosen.name}>
            <Breakdown category={chosen} />
            <button
              type="button"
              className="btn btn-secondary btn-wide"
              onClick={() => setChosen(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EnvelopeTile({
  category: x,
  chosen,
  onChoose,
}: {
  category: Category;
  chosen: boolean;
  onChoose: () => void;
}) {
  const state = stateOf(x);
  const left = had(x) <= 0 ? 0 : Math.max(0, available(x) / had(x));
  return (
    <li>
      <button
        type="button"
        className="c-tile"
        data-state={state}
        aria-pressed={chosen}
        onClick={onChoose}
        style={{ "--left": `${left * 100}%` } as CSSProperties}
      >
        <span className="c-tile-name">{x.name}</span>
        <span className="c-tile-amount num">{money(available(x))}</span>
        <span className="c-tile-note small">
          {state === "overspent"
            ? "Overspent"
            : had(x) === 0
              ? "Nothing assigned"
              : `of ${money(had(x))}`}
        </span>
      </button>
    </li>
  );
}

function Breakdown({ category: x }: { category: Category }) {
  const state = stateOf(x);
  return (
    <section className="c-breakdown card" data-state={state}>
      <h2 className="c-breakdown-title">
        <Tile name={x.name} /> {x.name}
      </h2>
      <dl>
        <div>
          <dt>Carried forward from September</dt>
          <dd className="num">{money(x.carried)}</dd>
        </div>
        <div>
          <dt>Assigned in October</dt>
          <dd className="num">+ {money(x.assigned)}</dd>
        </div>
        <div>
          <dt>Spending in October</dt>
          <dd className="num">− {money(x.spending)}</dd>
        </div>
        <div className="c-total">
          <dt>Available</dt>
          <dd>
            <Pill category={x} />
          </dd>
        </div>
      </dl>
      <p className="muted small">
        {state === "overspent"
          ? `${x.name} spent more than it had. Raise its Assignment by ${money(-available(x))} to cover it; until then it stays Overspent and carries into November.`
          : state === "zero"
            ? `${x.name} has nothing left this Month.`
            : `Whatever ${x.name} doesn’t spend carries into November.`}
      </p>
      <div className="row-gap">
        <button type="button" className="btn btn-primary">
          {state === "overspent" ? `Cover ${money(-available(x))}` : "Assign"}
        </button>
        <button type="button" className="btn btn-secondary">
          Move money
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Shared parts                                                        */
/* ------------------------------------------------------------------ */

function Header({ wide }: { wide: boolean }) {
  return (
    <header className="header">
      <h1 className="title">Budget</h1>
      <button type="button" className="month">
        {MONTH}
        <Chevron />
      </button>
      {wide && (
        <div className="header-actions">
          <button type="button" className="btn btn-quiet">
            Copy last Month
          </button>
          <button type="button" className="btn btn-secondary">
            Move money
          </button>
        </div>
      )}
    </header>
  );
}

function ReadyToAssign({
  amount,
  newcomer,
}: {
  amount: number;
  newcomer: boolean;
}) {
  return (
    <div className="hero rta">
      <p className="hero-label">
        Ready to Assign <Hint term="rta" onHero />
      </p>
      <p className="display num">{money(amount)}</p>
      <div className="split rta-foot">
        <p className="hero-muted small">
          {amount < 0
            ? "You’ve assigned more than you have. Take some back."
            : amount === 0
              ? "Every dollar has a job."
              : newcomer
                ? "This is the money in your Accounts. Give each dollar a job."
                : "Give these dollars a job."}
        </p>
        <button type="button" className="btn btn-hero">
          Assign
        </button>
      </div>
    </div>
  );
}

function SpentCard({ month: m, chart }: { month: Month; chart: "line" }) {
  const t = totals(m);
  return (
    <div className="card spent" data-chart={chart}>
      <div className="split">
        <span>Spent this Month</span>
        <span className="num">
          {money(t.spent)}{" "}
          <span className="muted">of {money(t.had)} assigned</span>
        </span>
      </div>
      {m.daily.length === 0 ? (
        <p className="muted small">
          Nothing recorded yet. Spending shows up here as you record it.
        </p>
      ) : (
        <>
          <Sparkline daily={m.daily} had={t.had} />
          <p className="muted small">
            {DAYS - TODAY} days to go. The dashed line is an even pace.
          </p>
        </>
      )}
    </div>
  );
}

function GroupHead({ group: g, hint }: { group: Group; hint?: boolean }) {
  const sum = g.categories.reduce((s, x) => s + available(x), 0);
  return (
    <div className="split group-head">
      <h2>{g.name}</h2>
      <span className="muted small">
        {hint && (
          <>
            Available <Hint term="available" />{" "}
          </>
        )}
        <span className="num">{money(sum)}</span>
      </span>
    </div>
  );
}

function Note({ category: x }: { category: Category }) {
  const state = stateOf(x);
  if (state === "overspent")
    return (
      <p className="note note-over small">
        <Warn /> Overspent by {money(-available(x))} <Hint term="overspent" />
        <button type="button" className="link">
          Cover it
        </button>
      </p>
    );
  if (had(x) === 0)
    return <p className="note muted small">Nothing assigned yet</p>;
  return (
    <p className="note muted small num">
      {money(x.spending)} of {money(had(x))} spent
    </p>
  );
}

function Pill({ category: x }: { category: Category }) {
  return (
    <span className="pill num" data-state={stateOf(x)}>
      {money(available(x))}
    </span>
  );
}

function Bar({ category: x, thin }: { category: Category; thin?: boolean }) {
  const h = had(x);
  const used = h <= 0 ? (x.spending > 0 ? 1 : 0) : x.spending / h;
  return (
    // The figures beside every bar carry the same information.
    <span
      className="bar"
      data-thin={thin}
      data-over={available(x) < 0}
      aria-hidden
    >
      <i style={{ width: `${Math.min(used, 1) * 100}%` }} />
    </span>
  );
}

function PaceBar({
  spent,
  had,
  onHero,
}: {
  spent: number;
  had: number;
  onHero?: boolean;
}) {
  const used = had === 0 ? 0 : Math.min(spent / had, 1);
  return (
    <span className="bar pace" data-on-hero={onHero} aria-hidden>
      <i style={{ width: `${used * 100}%` }} />
      <b style={{ left: `${(TODAY / DAYS) * 100}%` }} />
    </span>
  );
}

function Sparkline({ daily, had }: { daily: number[]; had: number }) {
  const w = 320;
  const h = 64;
  const x = (day: number) => (day / (DAYS - 1)) * w;
  const y = (amount: number) => h - 4 - (amount / had) * (h - 8);
  const line = daily
    .map(
      (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
    )
    .join(" ");
  const last = daily.length - 1;
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path className="spark-area" d={`${line} L${x(last)},${h} L0,${h} Z`} />
      <path className="spark-pace" d={`M0,${y(0)} L${w},${y(had)}`} />
      <path className="spark-line" d={line} />
      <circle className="spark-dot" cx={x(last)} cy={y(daily[last])} r="4" />
    </svg>
  );
}

const hints = {
  rta: "Money that doesn’t have a job yet. Assign all of it to Categories until this reads $0.00. Below zero means you’ve assigned more than you have.",
  available:
    "What a Category has left to spend this Month: what it carried forward, plus this Month’s Assignment, minus its Spending. Whatever’s left carries into next Month.",
  overspent:
    "This Category spent more than it had. It stays Overspent, Month after Month, until you raise its Assignment to cover it.",
};

function Hint({
  term,
  onHero,
}: {
  term: keyof typeof hints;
  onHero?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hint" data-on-hero={onHero}>
      <button
        type="button"
        className="hint-button"
        aria-expanded={open}
        aria-label={`What is ${{ rta: "Ready to Assign", available: "Available", overspent: "Overspent" }[term]}?`}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      {open && (
        <span className="hint-bubble" role="note">
          {hints[term]}
        </span>
      )}
    </span>
  );
}

function Tile({ name }: { name: string }) {
  return (
    <span className="tile" aria-hidden>
      {name[0]}
    </span>
  );
}

function Rail() {
  const accounts = [
    ["Checking", 4210.55],
    ["Savings", 6130],
    ["Cash", 120],
  ] as const;
  return (
    <nav className="rail" aria-label="Places">
      <button type="button" className="btn btn-primary btn-wide">
        <Plus /> Record
      </button>
      <a className="rail-item" aria-current="page" href="#budget">
        Budget
      </a>
      <p className="rail-head muted small">Accounts</p>
      <a className="rail-item" href="#all">
        All Accounts
        <span className="num muted">{money(10460.55)}</span>
      </a>
      {accounts.map(([name, balance]) => (
        <a key={name} className="rail-item rail-account" href={`#${name}`}>
          {name}
          <span className="num muted">{money(balance)}</span>
        </a>
      ))}
      <button type="button" className="link rail-add">
        Add an Account
      </button>
    </nav>
  );
}

function TabBar() {
  return (
    <nav className="tabs" aria-label="Places">
      <span className="tab" aria-current="page">
        <TabIcon kind="budget" />
        Budget
      </span>
      <span className="tab">
        <TabIcon kind="activity" />
        Activity
      </span>
      <button type="button" className="record" aria-label="Record">
        <Plus />
      </button>
      <span className="tab">
        <TabIcon kind="accounts" />
        Accounts
      </span>
    </nav>
  );
}

function Chevron() {
  return (
    <svg
      className="chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden
    >
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

function Warn() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 1.5 13 12.5H1Z" fill="currentColor" />
      <path
        d="M7 5.5v3.2M7 10.4v.1"
        stroke="var(--card)"
        strokeWidth="1.6"
        strokeLinecap="round"
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
