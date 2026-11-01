// PROTOTYPE (prototype/assign): throwaway. Four ways to set Assignments, Move
// Money and Copy last Month for "How does the user set Assignments, Move Money
// and Copy last Month?" (#80), switchable via `?assign=A|B|C|D`. Each variant
// owns what the Budget screen's entry points do: the Assign button on Ready
// to Assign, Cover it on an Overspent Category, the Assigned pill in the
// desktop table, and Copy last Month / Move money. `?frame=phone|desktop`
// picks the device. `?data=typical|fresh` picks the Month: `typical` is late
// October with three Categories Overspent and five not assigned yet; `fresh`
// is the 1st, with nothing assigned. `?scheme=system|dark|light`. Everything
// is in memory; Reset starts over. On D, `?neg=a|b|c` picks what happens when
// money leaves a Category whose Assignment is smaller than the amount (#80's
// open choice): a lets the Assignment go negative, b forbids it, c takes it
// back from what the Category carried forward, as its own figure.
// `?data=moved` starts from the typical Month just after covering Dining out's
// $42.50 from Holiday, which has nothing assigned in October, so the three
// rules differ from the first screen.
import "@fontsource-variable/geist";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useUrlParameter } from "../url-parameter";
import "../budget-screen-prototype/prototype.css";
import "../record-prototype/record.css";
import "./assign.css";

type Category = {
  id: string;
  name: string;
  group: string;
  carried: number;
  spending: number;
  /** Last Month's Assignment, which Copy last Month copies. */
  last: number;
};
/**
 * This Month's Assignment for each Category id; missing means none yet. Under
 * rule c, `taken:<id>` holds what was taken back from its carried forward.
 */
type Assigned = Record<string, number>;
const TAKEN = "taken:";
/**
 * When money leaves a Category whose Assignment is smaller than the amount:
 * a, the Assignment goes negative; b, refused; c, the rest is taken back from
 * what it carried forward.
 */
type Rule = "a" | "b" | "c";

const variantKeys = ["A", "B", "C", "D"] as const;
type VariantKey = (typeof variantKeys)[number];
const variantNames: Record<VariantKey, string> = {
  A: "Assign in place",
  B: "One Category at a time",
  C: "Everything is a move",
  D: "B, faster",
};

const MONTH = "October";
const LAST_MONTH = "September";

const cat = (
  group: string,
  name: string,
  carried: number,
  spending: number,
  last: number,
): Category => ({
  id: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  group,
  carried,
  spending,
  last,
});
const typicalCategories: Category[] = [
  cat("Bills", "Rent", 0, 1400, 1400),
  cat("Bills", "Electricity", 0, 62.18, 90),
  cat("Bills", "Internet", 0, 0, 55),
  cat("Bills", "Phone", 0, 40, 40),
  cat("Everyday", "Groceries", 40, 412.4, 600),
  cat("Everyday", "Dining out", 0, 342.5, 300),
  cat("Everyday", "Transport", 20, 96, 180),
  cat("Everyday", "Shopping", 0, 268, 250),
  cat("Life", "Fun", 36, 20, 200),
  cat("Life", "Gifts", 0, 25.99, 0),
  cat("Life", "Subscriptions", 0, 0, 45),
  cat("Savings", "Emergency fund", 5000, 0, 330),
  cat("Savings", "Holiday", 600, 0, 200),
];
const typicalAssigned: Assigned = {
  rent: 1400,
  electricity: 90,
  phone: 40,
  groceries: 560,
  "dining-out": 300,
  transport: 160,
  shopping: 250,
};
/** Everything that came in without a Category, less earlier Months' Assignments. */
const POOL = 3455;

const datasets = {
  typical: { categories: typicalCategories, assigned: typicalAssigned },
  fresh: {
    categories: typicalCategories.map((x) => ({ ...x, spending: 0 })),
    assigned: {} as Assigned,
  },
};
type DataKey = keyof typeof datasets;
type StartKey = DataKey | "moved";

/** This Month's Assignments to start from; under rule b the move is refused. */
function startingAssignments(start: StartKey, rule: Rule): Assigned {
  if (start !== "moved") return datasets[start].assigned;
  if (rule === "b") return typicalAssigned;
  const w = worldOf(typicalCategories, typicalAssigned, rule);
  return move(w, "holiday", "dining-out", 42.5);
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n: number) => usd.format(n).replace("-", "−");
const cents = (n: number) => Math.round(n * 100) / 100;
const parse = (typed: string) => cents(Number.parseFloat(typed) || 0);
const typedFrom = (n: number) =>
  n === 0 ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2);

/* ------------------------------------------------------------------ */
/* The Month being assigned                                           */
/* ------------------------------------------------------------------ */

type World = {
  rule: Rule;
  categories: Category[];
  groups: string[];
  assigned: Assigned;
  byId(id: string): Category;
  assignment(id: string): number;
  /** Rule c: carried forward money taken back this Month. */
  takenBack(id: string): number;
  available(id: string): number;
  /** What can leave this Category under the rule. */
  movable(id: string): number;
  readyToAssign: number;
  overspent: Category[];
  /** Categories Copy last Month would fill: none this Month, some last. */
  copyable: Category[];
};

function worldOf(
  categories: Category[],
  assigned: Assigned,
  rule: Rule = "a",
): World {
  const byId = (id: string) => {
    const x = categories.find((c) => c.id === id);
    if (!x) throw new Error(id);
    return x;
  };
  const assignment = (id: string) => assigned[id] ?? 0;
  const takenBack = (id: string) => assigned[TAKEN + id] ?? 0;
  const available = (id: string) =>
    cents(
      byId(id).carried - takenBack(id) + assignment(id) - byId(id).spending,
    );
  const sum = (taken: boolean) =>
    Object.entries(assigned)
      .filter(([k]) => k.startsWith(TAKEN) === taken)
      .reduce((s, [, n]) => s + n, 0);
  return {
    rule,
    categories,
    groups: [...new Set(categories.map((x) => x.group))],
    assigned,
    byId,
    assignment,
    takenBack,
    available,
    movable: (id) =>
      Math.max(
        0,
        rule === "b" ? Math.min(available(id), assignment(id)) : available(id),
      ),
    readyToAssign: cents(POOL - sum(false) + sum(true)),
    overspent: categories.filter((x) => available(x.id) < 0),
    copyable: categories.filter((x) => !(x.id in assigned) && x.last > 0),
  };
}

const stateOf = (n: number) =>
  n < 0 ? "overspent" : n === 0 ? "zero" : ("available" as const);

/** Ready to Assign's own end of a move. */
const RTA = "rta";
type End = string;
const endName = (w: World, end: End) =>
  end === RTA ? "Ready to Assign" : w.byId(end).name;
const endAmount = (w: World, end: End) =>
  end === RTA ? w.readyToAssign : w.available(end);

/** Raises `to`'s Assignment by `amount` and lowers `from`'s, or takes it from Ready to Assign. */
function move(w: World, from: End, to: End, amount: number): Assigned {
  const next = { ...w.assigned };
  if (from !== RTA) lower(w, next, from, amount);
  if (to !== RTA) next[to] = cents(w.assignment(to) + amount);
  return next;
}

/** Takes `amount` out of a Category: its Assignment, then, under rule c, what it carried forward. */
function lower(w: World, next: Assigned, id: string, amount: number) {
  const now = w.assignment(id);
  if (w.rule !== "c") {
    next[id] = cents(now - amount);
    return;
  }
  const fromAssignment = Math.min(amount, Math.max(0, now));
  next[id] = cents(now - fromAssignment);
  const rest = cents(amount - fromAssignment);
  if (rest > 0) next[TAKEN + id] = cents(w.takenBack(id) + rest);
}

/** Sets an Assignment to `n`. Below zero, rule b stops at $0 and rule c takes the rest back from carried forward. */
function setTo(w: World, id: string, n: number): Assigned {
  const next = { ...w.assigned };
  if (n >= 0 || w.rule === "a") next[id] = n;
  else if (w.rule === "b") next[id] = 0;
  else lower(w, next, id, cents(w.assignment(id) - n));
  return next;
}

/** An Assignment in a breakdown: "+ $300.00", or "− $42.50" when negative. */
const plusMinus = (n: number) => (n < 0 ? `− ${money(-n)}` : `+ ${money(n)}`);

/** Explains an Assignment of `n` below zero, typed or already saved. */
function negativeNote(w: World, id: string, n: number): string {
  if (w.rule === "b") return "An Assignment can’t go below $0.00.";
  const now = w.assignment(id);
  if (n === now)
    return "A negative Assignment takes back money carried forward from earlier Months.";
  return lowerNote(w, id, cents(now - n));
}

/** What "Give back" offers when Ready to Assign is below zero. */
function giveBackFor(w: World, id: string): number {
  if (w.readyToAssign >= 0) return 0;
  return cents(Math.min(-w.readyToAssign, w.movable(id)));
}

/** Says what lowering a Category by `amount` does to it under the rule. */
function lowerNote(w: World, id: string, amount: number): string {
  const x = w.byId(id);
  const now = w.assignment(id);
  if (w.rule === "c" && amount > Math.max(0, now)) {
    const fromAssignment = Math.max(0, now);
    return fromAssignment > 0
      ? `Takes ${money(fromAssignment)} from ${x.name}’s ${MONTH} Assignment and ${money(cents(amount - fromAssignment))} back from what it carried forward.`
      : `Takes ${money(amount)} back from what ${x.name} carried forward. Its ${MONTH} Assignment stays ${money(now)}.`;
  }
  const after = cents(now - amount);
  return `Lowers ${x.name}’s ${MONTH} Assignment from ${money(now)} to ${money(after)}.${
    after < 0
      ? " A negative Assignment takes back money carried forward from earlier Months."
      : ""
  }`;
}

function copied(w: World, only?: Set<string>): Assigned {
  const next = { ...w.assigned };
  for (const x of w.copyable) if (!only || only.has(x.id)) next[x.id] = x.last;
  return next;
}

type VariantProps = {
  world: World;
  wide: boolean;
  /** Replaces this Month's Assignments; the toast offers Undo. */
  change(next: Assigned, toast: string): void;
};

/* ------------------------------------------------------------------ */
/* Host                                                               */
/* ------------------------------------------------------------------ */

type Toast = { text: string; undo: Assigned };

export function AssignPrototype() {
  const [variantParam, setVariant] = useUrlParameter("assign");
  const [frameParam, setFrame] = useUrlParameter("frame");
  const [dataParam, setData] = useUrlParameter("data");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const [negParam, setNeg] = useUrlParameter("neg");
  const key: VariantKey =
    variantKeys.find((k) => k === variantParam) ?? variantKeys[0];
  // Only D offers the other rules; A to C keep a, as moveMoney does today.
  const rule: Rule =
    key === "D" && (negParam === "b" || negParam === "c") ? negParam : "a";
  const frame =
    frameParam === "phone" || frameParam === "desktop"
      ? frameParam
      : window.innerWidth < 900
        ? "phone"
        : "desktop";
  const start: StartKey =
    dataParam === "fresh" || dataParam === "moved" ? dataParam : "typical";
  const data: DataKey = start === "fresh" ? "fresh" : "typical";
  const scheme = schemeParam ?? "dark";

  const [assigned, setAssigned] = useState<Assigned>(() =>
    startingAssignments(start, rule),
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const [run, setRun] = useState(0);
  const world = worldOf(datasets[data].categories, assigned, rule);

  // A new data set starts over.
  const lastStart = useRef(start);
  if (lastStart.current !== start) {
    lastStart.current = start;
    setAssigned(startingAssignments(start, rule));
    setToast(null);
  }

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

  function change(next: Assigned, text: string) {
    setToast({ text, undo: assigned });
    setAssigned(next);
  }

  const Variant = { A: VariantA, B: VariantB, C: VariantC, D: VariantD }[key];
  const variant = (
    <Variant
      key={`${key}-${frame}-${start}-${rule}-${run}`}
      world={world}
      wide={frame === "desktop"}
      change={change}
    />
  );
  const toastView = toast && (
    <div className="rt-toast as-toast" role="status">
      <span>{toast.text}</span>
      <button
        type="button"
        className="rt-toast-undo"
        onClick={() => {
          setAssigned(toast.undo);
          setToast(null);
        }}
      >
        Undo
      </button>
    </div>
  );

  return (
    <div className="bs rt as" data-scheme={scheme} data-frame={frame}>
      {frame === "phone" ? (
        <div className="bs-device">
          <div className="bs-phone">
            {variant}
            <TabBar />
            {toastView}
          </div>
        </div>
      ) : (
        <div className="bs-desktop">
          <Rail />
          <main className="bs-main">{variant}</main>
          {toastView}
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
            value={start}
            onChange={(e) => setData(e.target.value, "replace")}
            aria-label="Month shown"
          >
            <option value="typical">Late in the Month</option>
            <option value="fresh">The 1st, nothing assigned</option>
            <option value="moved">
              After covering Dining out from Holiday
            </option>
          </select>
          {key === "D" && (
            <select
              value={rule}
              onChange={(e) => {
                setNeg(e.target.value, "replace");
                setAssigned(
                  startingAssignments(
                    start,
                    e.target.value === "b" || e.target.value === "c"
                      ? e.target.value
                      : "a",
                  ),
                );
                setToast(null);
              }}
              aria-label="Negative Assignments"
            >
              <option value="a">a: Assignment can go negative</option>
              <option value="b">b: Only this Month’s Assignment moves</option>
              <option value="c">c: Take back carried forward</option>
            </select>
          )}
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
              setAssigned(startingAssignments(start, rule));
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
/* A. Assign in place: Assign turns the Budget screen itself into an  */
/* editor. Every Category's Assignment becomes a field, Ready to      */
/* Assign stays pinned above them and counts down as you type. Cover  */
/* fills the gap from Ready to Assign in one tap; Copy last Month     */
/* fills the empty fields at once, with Undo. Moving money between    */
/* Categories is just lowering one field and raising another.         */
/* ------------------------------------------------------------------ */

function VariantA({ world: w, wide, change }: VariantProps) {
  const [editing, setEditing] = useState<{ focus?: string } | null>(null);
  const [moving, setMoving] = useState(false);

  const cover = (id: string) =>
    change(
      move(w, RTA, id, -w.available(id)),
      `Covered ${w.byId(id).name} with ${money(-w.available(id))} from Ready to Assign`,
    );
  const copy = () =>
    change(
      copied(w),
      `Copied ${w.copyable.length} Assignments from ${LAST_MONTH}`,
    );

  if (wide)
    return (
      <>
        <DesktopBudget
          world={w}
          onAssign={() => {
            const first =
              w.overspent[0] ?? w.categories.find((x) => !(x.id in w.assigned));
            document
              .querySelector<HTMLInputElement>(`#assign-${first?.id ?? "rent"}`)
              ?.focus();
          }}
          onCover={cover}
          onCopy={copy}
          onMove={() => setMoving(true)}
          assignedCell={(x) => (
            <AssignField
              world={w}
              category={x}
              onSet={(n) =>
                change(
                  { ...w.assigned, [x.id]: n },
                  `Assigned ${money(n)} to ${x.name}`,
                )
              }
              quiet
            />
          )}
        />
        {moving && (
          <Overlay wide label="Move money" onClose={() => setMoving(false)}>
            <MoveForm
              world={w}
              onMove={(from, to, amount) => {
                change(
                  move(w, from, to, amount),
                  `Moved ${money(amount)} from ${endName(w, from)} to ${endName(w, to)}`,
                );
                setMoving(false);
              }}
            />
          </Overlay>
        )}
      </>
    );

  if (!editing)
    return (
      <PhoneBudget
        world={w}
        onAssign={() => setEditing({})}
        onCover={(id) => setEditing({ focus: id })}
      />
    );

  return (
    <div className="stack asa">
      <div className="asa-bar" data-state={stateOf(w.readyToAssign)}>
        <div className="split">
          <span>
            <span className="small asa-bar-label">Ready to Assign</span>
            <strong className="num asa-bar-amount">
              {money(w.readyToAssign)}
            </strong>
          </span>
          <button
            type="button"
            className="btn btn-hero"
            onClick={() => setEditing(null)}
          >
            Done
          </button>
        </div>
        <RtaLine amount={w.readyToAssign} />
        {w.copyable.length > 0 && (
          <button type="button" className="chip asa-copy" onClick={copy}>
            Copy {LAST_MONTH} into {w.copyable.length} empty Categories (
            {money(w.copyable.reduce((s, x) => s + x.last, 0))})
          </button>
        )}
      </div>
      {w.groups.map((g) => (
        <section key={g}>
          <h2 className="group-head asa-group">{g}</h2>
          <ul className="card">
            {w.categories
              .filter((x) => x.group === g)
              .map((x) => {
                const n = w.available(x.id);
                return (
                  <li key={x.id} className="asa-row" data-state={stateOf(n)}>
                    <div className="split">
                      <span className="a-name">{x.name}</span>
                      <AssignField
                        world={w}
                        category={x}
                        autoFocus={editing.focus === x.id}
                        onSet={(v) =>
                          change(
                            { ...w.assigned, [x.id]: v },
                            `Assigned ${money(v)} to ${x.name}`,
                          )
                        }
                      />
                    </div>
                    <div className="split small">
                      <span className="muted num">
                        Available{" "}
                        <strong className="asa-avail" data-state={stateOf(n)}>
                          {money(n)}
                        </strong>
                      </span>
                      <span className="row-gap">
                        {n < 0 && (
                          <button
                            type="button"
                            className="chip chip-small asa-cover"
                            onClick={() => cover(x.id)}
                          >
                            Cover {money(-n)}
                          </button>
                        )}
                        {x.last > 0 && w.assignment(x.id) !== x.last && (
                          <button
                            type="button"
                            className="chip chip-small"
                            onClick={() =>
                              change(
                                { ...w.assigned, [x.id]: x.last },
                                `Assigned ${money(x.last)} to ${x.name}`,
                              )
                            }
                          >
                            {LAST_MONTH}: {money(x.last)}
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** An Assignment typed in place. It saves when you leave it or press Enter. */
function AssignField({
  world: w,
  category: x,
  onSet,
  autoFocus,
  quiet,
  onFocused,
  onTyped,
  saves = (n) => n,
}: {
  world: World;
  category: Category;
  onSet(n: number): void;
  autoFocus?: boolean;
  quiet?: boolean;
  /** D: the panel beside the table follows the focused field. */
  onFocused?(): void;
  /** D: what the Assignment becomes once saved, for rules that stop at $0. */
  saves?(n: number): number;
  onTyped?(typed: string): void;
}) {
  const saved = w.assignment(x.id);
  const [typed, setTyped] = useState(typedFrom(saved));
  const ref = useRef<HTMLInputElement>(null);
  // Copy last Month and Cover change the Assignment from outside the field.
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setTyped(typedFrom(saved));
  }
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.scrollIntoView({ block: "center" });
    ref.current?.focus();
  }, [autoFocus]);

  function commit() {
    const n = parse(typed);
    if (n !== saved) onSet(n);
    setTyped(typedFrom(saves(n)));
  }
  return (
    <label className="asa-field" data-quiet={quiet}>
      <span className="visually-hidden">
        Assigned to {x.name} in {MONTH}
      </span>
      <span aria-hidden>$</span>
      <input
        ref={ref}
        id={`assign-${x.id}`}
        inputMode="decimal"
        placeholder="0"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          onTyped?.(e.target.value);
        }}
        onFocus={(e) => {
          e.target.select();
          onFocused?.();
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTyped(typedFrom(saved));
            onTyped?.(typedFrom(saved));
          }
          const by =
            e.key === "Enter" || e.key === "ArrowDown"
              ? 1
              : e.key === "ArrowUp"
                ? -1
                : 0;
          if (by === 0) return;
          e.preventDefault();
          commit();
          const all = [
            ...document.querySelectorAll<HTMLInputElement>("[id^='assign-']"),
          ];
          all[all.indexOf(e.currentTarget) + by]?.focus();
        }}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* B. One Category at a time: tapping a Category opens its own sheet, */
/* which shows how its Available is made up and sets its Assignment,  */
/* with suggestions: cover the overspending, same as last Month. It   */
/* can take the money from Ready to Assign or from another Category   */
/* (Move Money). Assign walks through what needs a job, one Category  */
/* after another, offering Copy last Month first.                     */
/* ------------------------------------------------------------------ */

function VariantB({ world: w, wide, change }: VariantProps) {
  type Open =
    | { kind: "category"; id: string; cover?: boolean }
    | { kind: "walk" }
    | { kind: "copy" }
    | { kind: "move" };
  const [open, setOpen] = useState<Open | null>(null);
  const close = () => setOpen(null);

  const panel = open && (
    <Overlay
      wide={wide}
      side
      label={
        open.kind === "category"
          ? w.byId(open.id).name
          : open.kind === "walk"
            ? `Assign ${MONTH}`
            : open.kind === "copy"
              ? `Copy ${LAST_MONTH}`
              : "Move money"
      }
      onClose={close}
    >
      {open.kind === "category" && (
        <CategoryPanel
          key={open.id}
          world={w}
          id={open.id}
          cover={open.cover}
          change={change}
          onDone={close}
        />
      )}
      {open.kind === "walk" && (
        <Walk world={w} change={change} onDone={close} />
      )}
      {open.kind === "copy" && (
        <CopyPreview
          world={w}
          onCopy={(next, count) => {
            change(next, `Copied ${count} Assignments from ${LAST_MONTH}`);
            close();
          }}
        />
      )}
      {open.kind === "move" && (
        <MoveForm
          world={w}
          onMove={(from, to, amount) => {
            change(
              move(w, from, to, amount),
              `Moved ${money(amount)} from ${endName(w, from)} to ${endName(w, to)}`,
            );
            close();
          }}
        />
      )}
    </Overlay>
  );

  return (
    <>
      {wide ? (
        <DesktopBudget
          world={w}
          onAssign={() => setOpen({ kind: "walk" })}
          onCover={(id) => setOpen({ kind: "category", id, cover: true })}
          onCopy={() => setOpen({ kind: "copy" })}
          onMove={() => setOpen({ kind: "move" })}
          selected={open?.kind === "category" ? open.id : undefined}
          assignedCell={(x) => (
            <button
              type="button"
              className="a-assigned"
              onClick={() => setOpen({ kind: "category", id: x.id })}
            >
              {money(w.assignment(x.id))}
            </button>
          )}
        />
      ) : (
        <PhoneBudget
          world={w}
          onAssign={() => setOpen({ kind: "walk" })}
          onCover={(id) => setOpen({ kind: "category", id, cover: true })}
          onOpen={(id) => setOpen({ kind: "category", id })}
        />
      )}
      {panel}
    </>
  );
}

function CategoryPanel({
  world: w,
  id,
  cover,
  change,
  onDone,
  step,
}: {
  world: World;
  id: string;
  cover?: boolean;
  change: VariantProps["change"];
  onDone(): void;
  step?: { n: number; of: number; onSkip(): void };
}) {
  const x = w.byId(id);
  const now = w.assignment(id);
  const short = Math.max(0, -w.available(id));
  const [source, setSource] = useState<End>(
    cover && short > w.readyToAssign
      ? (w.categories.find((c) => c.id !== id && w.available(c.id) >= short)
          ?.id ?? RTA)
      : RTA,
  );
  const [typed, setTyped] = useState(
    typedFrom(source === RTA ? cents(now + short * Number(!!cover)) : short),
  );
  const amount = parse(typed);

  // From Ready to Assign, the field is the Assignment itself; from another
  // Category, it's how much to move in.
  const fromRta = source === RTA;
  const nextAssigned = fromRta ? amount : cents(now + amount);
  const nextAvailable = cents(x.carried + nextAssigned - x.spending);
  const sourceAfter = fromRta
    ? cents(w.readyToAssign - (amount - now))
    : cents(w.available(source) - amount);
  const unchanged = fromRta ? amount === now : amount === 0;
  const fieldId = useId();

  function save() {
    if (fromRta)
      change(
        { ...w.assigned, [id]: amount },
        `Assigned ${money(amount)} to ${x.name}`,
      );
    else
      change(
        move(w, source, id, amount),
        `Moved ${money(amount)} from ${endName(w, source)} to ${x.name}`,
      );
    onDone();
  }

  const suggestions: [string, string][] = fromRta
    ? [
        ...(short > 0 && amount !== cents(now + short)
          ? [
              [
                `Cover it: ${money(cents(now + short))}`,
                String(cents(now + short)),
              ] as [string, string],
            ]
          : []),
        ...(x.last > 0 && x.last !== amount
          ? [
              [`${LAST_MONTH}: ${money(x.last)}`, String(x.last)] as [
                string,
                string,
              ],
            ]
          : []),
        ...(w.readyToAssign > 0
          ? [
              [
                `All of Ready to Assign`,
                String(cents(now + w.readyToAssign)),
              ] as [string, string],
            ]
          : []),
      ]
    : short > 0 && amount !== short
      ? [[`Cover it: ${money(short)}`, String(short)]]
      : [];

  return (
    <>
      <div className="rt-body asb">
        {step && (
          <p className="muted small">
            {step.n} of {step.of} that need a job
          </p>
        )}
        <div className="asb-head">
          {step && (
            <>
              <span className="small muted">{x.group}</span>
              <h3 className="asb-name">{x.name}</h3>
            </>
          )}
          <p
            className="asb-available num"
            data-state={stateOf(w.available(id))}
          >
            {money(w.available(id))}{" "}
            <span className="small">
              {short > 0 ? `Overspent by ${money(short)}` : "Available"}
            </span>
          </p>
        </div>
        <dl className="asb-sum card num">
          <div>
            <dt>Carried forward from {LAST_MONTH}</dt>
            <dd>{money(x.carried)}</dd>
          </div>
          <div>
            <dt>Assigned in {MONTH}</dt>
            <dd>{plusMinus(now)}</dd>
          </div>
          <div>
            <dt>Spending</dt>
            <dd>− {money(x.spending)}</dd>
          </div>
          <div className="asb-total">
            <dt>Available</dt>
            <dd>{money(w.available(id))}</dd>
          </div>
        </dl>

        <fieldset className="seg">
          <legend className="visually-hidden">
            Where the money comes from
          </legend>
          <button
            type="button"
            aria-pressed={fromRta}
            onClick={() => {
              setSource(RTA);
              setTyped(typedFrom(cents(now + short)));
            }}
          >
            Ready to Assign
          </button>
          <button
            type="button"
            aria-pressed={!fromRta}
            onClick={() => {
              const best = [...w.categories]
                .filter((c) => c.id !== id && w.available(c.id) > 0)
                .sort((a, b) => w.available(b.id) - w.available(a.id))[0];
              if (best) setSource(best.id);
              setTyped(typedFrom(short));
            }}
          >
            Another Category
          </button>
        </fieldset>

        {!fromRta && (
          <label className="rt-field rt-account">
            <span className="small muted">Take it from</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {w.groups.map((g) => (
                <optgroup key={g} label={g}>
                  {w.categories
                    .filter((c) => c.group === g && c.id !== id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({money(w.available(c.id))} available)
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        <div className="rt-field">
          <label className="small muted" htmlFor={fieldId}>
            {fromRta ? `Assigned in ${MONTH}` : `Move to ${x.name}`}
          </label>
          <span className="asb-amount num">
            $
            <input
              id={fieldId}
              className="asb-input"
              inputMode="decimal"
              placeholder="0"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </span>
          {suggestions.length > 0 && (
            <div className="rt-suggest">
              {suggestions.map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  className="chip chip-small"
                  onClick={() => setTyped(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rt-meter num">
          <div className="split">
            <span>{x.name} Available after</span>
            <strong data-state={stateOf(nextAvailable)}>
              {money(nextAvailable)}
            </strong>
          </div>
          <div className="split">
            <span>
              {fromRta ? "Ready to Assign" : endName(w, source)}
              {fromRta ? "" : " Available"} after
            </span>
            <strong data-state={stateOf(sourceAfter)}>
              {money(sourceAfter)}
            </strong>
          </div>
        </div>
      </div>
      <div className="rt-foot rt-save">
        {step && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={step.onSkip}
          >
            Skip
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary rt-save-main"
          disabled={unchanged && !step}
          onClick={unchanged ? onDone : save}
        >
          {unchanged
            ? "Next"
            : fromRta
              ? `Assign ${money(amount)}${step ? " and next" : ""}`
              : `Move ${money(amount)}${step ? " and next" : ""}`}
        </button>
      </div>
    </>
  );
}

/** Assign: Copy last Month first, then each Category that needs a job. */
function Walk({
  world: w,
  change,
  onDone,
}: {
  world: World;
  change: VariantProps["change"];
  onDone(): void;
}) {
  // The queue is fixed when the walk starts, so saving doesn't reshuffle it.
  const [queue, setQueue] = useState(() => [
    ...w.overspent.map((x) => x.id),
    ...w.categories
      .filter((x) => !(x.id in w.assigned) && w.available(x.id) >= 0)
      .map((x) => x.id),
  ]);
  const [offerCopy, setOfferCopy] = useState(w.copyable.length > 0);
  const [i, setI] = useState(0);

  if (offerCopy)
    return (
      <>
        <div className="rt-body">
          <p>
            {w.copyable.length} Categories have nothing assigned in {MONTH} yet.
            Start them from what you assigned in {LAST_MONTH}?
          </p>
          <CopyList world={w} onlyCopyable />
        </div>
        <div className="rt-foot rt-save">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setOfferCopy(false)}
          >
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary rt-save-main"
            onClick={() => {
              const copiedIds = new Set(w.copyable.map((x) => x.id));
              change(
                copied(w),
                `Copied ${w.copyable.length} Assignments from ${LAST_MONTH}`,
              );
              setQueue(
                queue.filter((id) => !copiedIds.has(id) || w.available(id) < 0),
              );
              setOfferCopy(false);
            }}
          >
            Copy {w.copyable.length} Assignments
          </button>
        </div>
      </>
    );

  if (i >= queue.length)
    return (
      <>
        <div className="rt-body asb-done">
          <p className="asb-name">That’s every Category.</p>
          <p className="muted">
            Ready to Assign is{" "}
            <strong className="num">{money(w.readyToAssign)}</strong>.
          </p>
          <RtaLine amount={w.readyToAssign} plain />
        </div>
        <div className="rt-foot">
          <button
            type="button"
            className="btn btn-primary btn-wide rt-save-main"
            onClick={onDone}
          >
            Done
          </button>
        </div>
      </>
    );

  return (
    <CategoryPanel
      key={queue[i]}
      world={w}
      id={queue[i]}
      cover={w.available(queue[i]) < 0}
      change={change}
      onDone={() => setI(i + 1)}
      step={{ n: i + 1, of: queue.length, onSkip: () => setI(i + 1) }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* C. Everything is a move: one Move money sheet does all of it.      */
/* Assigning is moving money from Ready to Assign into a Category;    */
/* Cover it is moving into an Overspent one from wherever has money,  */
/* with what covers it in full listed first. The sheet shows both     */
/* ends before and after. Copy last Month lists each Assignment it    */
/* would copy, to tick off. The Month button holds both on a phone.   */
/* ------------------------------------------------------------------ */

function VariantC({ world: w, wide, change }: VariantProps) {
  type Open =
    | { kind: "move"; from: End | null; to: End | null; amount: number }
    | { kind: "copy" }
    | { kind: "set"; id: string };
  const [open, setOpen] = useState<Open | null>(null);
  const close = () => setOpen(null);

  const assign = () =>
    setOpen({ kind: "move", from: RTA, to: null, amount: 0 });
  const cover = (id: string) =>
    setOpen({ kind: "move", from: null, to: id, amount: -w.available(id) });
  const copyNow = () => setOpen({ kind: "copy" });
  const moveNow = () =>
    setOpen({ kind: "move", from: null, to: null, amount: 0 });

  return (
    <>
      {wide ? (
        <DesktopBudget
          world={w}
          onAssign={assign}
          onCover={cover}
          onCopy={copyNow}
          onMove={moveNow}
          assignedCell={(x) => (
            <span className="asc-pop-host">
              <button
                type="button"
                className="a-assigned"
                aria-expanded={open?.kind === "set" && open.id === x.id}
                onClick={() => setOpen({ kind: "set", id: x.id })}
              >
                {money(w.assignment(x.id))}
              </button>
              {open?.kind === "set" && open.id === x.id && (
                <SetPopover
                  world={w}
                  category={x}
                  onClose={close}
                  onSet={(n) => {
                    change(
                      { ...w.assigned, [x.id]: n },
                      `Assigned ${money(n)} to ${x.name}`,
                    );
                    close();
                  }}
                  onMove={() =>
                    setOpen({ kind: "move", from: null, to: x.id, amount: 0 })
                  }
                />
              )}
            </span>
          )}
        />
      ) : (
        <PhoneBudget
          world={w}
          onAssign={assign}
          onCover={cover}
          monthMenu={[
            [`Copy ${LAST_MONTH}’s Assignments`, copyNow],
            ["Move money", moveNow],
          ]}
        />
      )}
      {open?.kind === "move" && (
        <Overlay wide={wide} label="Move money" onClose={close} full>
          <MoveSheet
            world={w}
            from={open.from}
            to={open.to}
            amount={open.amount}
            onMove={(from, to, amount) => {
              change(
                move(w, from, to, amount),
                from === RTA
                  ? `Assigned ${money(amount)} to ${endName(w, to)}`
                  : `Moved ${money(amount)} from ${endName(w, from)} to ${endName(w, to)}`,
              );
              close();
            }}
          />
        </Overlay>
      )}
      {open?.kind === "copy" && (
        <Overlay
          wide={wide}
          label={`Copy ${LAST_MONTH}’s Assignments`}
          onClose={close}
        >
          <CopyPreview
            world={w}
            selectable
            onCopy={(next, count) => {
              change(next, `Copied ${count} Assignments from ${LAST_MONTH}`);
              close();
            }}
          />
        </Overlay>
      )}
    </>
  );
}

function MoveSheet({
  world: w,
  from: initialFrom,
  to: initialTo,
  amount: initialAmount,
  onMove,
}: {
  world: World;
  from: End | null;
  to: End | null;
  amount: number;
  onMove(from: End, to: End, amount: number): void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [typed, setTyped] = useState(typedFrom(cents(initialAmount)));
  const [picking, setPicking] = useState<"from" | "to" | null>(
    initialTo === null ? "to" : initialFrom === null ? "from" : null,
  );
  const amount = parse(typed);
  const fieldId = useId();

  if (picking) {
    const other = picking === "from" ? to : from;
    const ends: End[] = [RTA, ...w.categories.map((x) => x.id)].filter(
      (e) => e !== other,
    );
    // Picking where it comes from: what covers the amount in full first.
    // Picking where it goes: Overspent Categories first.
    const sorted =
      picking === "from"
        ? [
            ...ends.filter((e) => e === RTA),
            ...ends
              .filter((e) => e !== RTA)
              .sort((a, b) => endAmount(w, b) - endAmount(w, a)),
          ]
        : [
            ...ends.filter((e) => e !== RTA && w.available(e) < 0),
            ...ends.filter((e) => e === RTA || w.available(e) >= 0),
          ];
    return (
      <div className="rt-body">
        <p className="asc-pick-title">
          {picking === "from"
            ? amount > 0
              ? `Where does ${money(amount)} come from?`
              : "Where does the money come from?"
            : "Where does the money go?"}
        </p>
        <ul className="card rt-list">
          {sorted.map((e) => {
            const n = endAmount(w, e);
            const full = picking === "from" && amount > 0 && n >= amount;
            return (
              <li key={e}>
                <button
                  type="button"
                  className="rt-list-row asc-end-row"
                  disabled={picking === "from" && n <= 0}
                  onClick={() => {
                    if (picking === "from") setFrom(e);
                    else {
                      setTo(e);
                      if (amount === 0 && e !== RTA && w.available(e) < 0)
                        setTyped(typedFrom(-w.available(e)));
                    }
                    setPicking(
                      picking === "to" && from === null ? "from" : null,
                    );
                  }}
                >
                  <Tile name={e === RTA ? "+" : endName(w, e)} />
                  <span className="rt-list-name">
                    <strong>{endName(w, e)}</strong>
                    <span className="small muted">
                      {e === RTA ? "Money without a job" : w.byId(e).group}
                      {full && " · covers it in full"}
                    </span>
                  </span>
                  <span className="pill num" data-state={stateOf(n)}>
                    {money(n)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const end = (role: "from" | "to", e: End | null) => {
    const before = e === null ? 0 : endAmount(w, e);
    const after = cents(role === "from" ? before - amount : before + amount);
    return (
      <button
        type="button"
        className="asc-end card"
        onClick={() => setPicking(role)}
      >
        <span className="small muted">{role === "from" ? "From" : "To"}</span>
        <span className="split">
          <strong>{e === null ? "Choose" : endName(w, e)}</strong>
          {e !== null && (
            <span className="num asc-change">
              {money(before)} <span aria-hidden>→</span>
              <span className="visually-hidden">becomes</span>{" "}
              <strong className="asc-after" data-state={stateOf(after)}>
                {money(after)}
              </strong>
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className="rt-body asc">
        <div className="b-amount-field">
          <label className="visually-hidden" htmlFor={fieldId}>
            Amount to move
          </label>
          $
          <input
            id={fieldId}
            inputMode="decimal"
            placeholder="0"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        {end("from", from)}
        {end("to", to)}
        {from !== null && to !== null && to !== RTA && (
          <p className="muted small">
            {from === RTA
              ? `Raises ${endName(w, to)}’s Assignment for ${MONTH} to ${money(cents(w.assignment(to) + amount))}.`
              : `Lowers ${endName(w, from)}’s Assignment to ${money(cents(w.assignment(from) - amount))} and raises ${endName(w, to)}’s to ${money(cents(w.assignment(to) + amount))}.`}
          </p>
        )}
      </div>
      <div className="rt-foot">
        <button
          type="button"
          className="btn btn-primary btn-wide rt-save-main"
          disabled={from === null || to === null || amount <= 0}
          onClick={() => from && to && onMove(from, to, amount)}
        >
          Move {money(amount)}
        </button>
      </div>
    </>
  );
}

/** The desktop Assigned pill, opened: set the number outright. */
function SetPopover({
  world: w,
  category: x,
  onSet,
  onMove,
  onClose,
}: {
  world: World;
  category: Category;
  onSet(n: number): void;
  onMove(): void;
  onClose(): void;
}) {
  const now = w.assignment(x.id);
  const [typed, setTyped] = useState(typedFrom(now));
  const n = parse(typed);
  return (
    <div
      className="asc-pop card"
      role="dialog"
      aria-label={`Assigned to ${x.name}`}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSet(n);
        }}
      >
        <label className="rt-field">
          <span className="small muted">Assigned in {MONTH}</span>
          <input
            inputMode="decimal"
            value={typed}
            ref={(input) => input?.focus()}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        <p className="small muted num">
          Ready to Assign after:{" "}
          <strong>{money(cents(w.readyToAssign - (n - now)))}</strong>
        </p>
        <div className="row-gap">
          <button type="submit" className="btn btn-primary">
            Save
          </button>
          <button type="button" className="btn btn-quiet" onClick={onMove}>
            Move from a Category
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* D. B, faster: B's guardrails with fewer taps. The Category sheet   */
/* stays open and steps through Categories (‹ ›, a swipe, or ↑ ↓);    */
/* Enter, the keyboard's Next key, or a suggestion saves and moves    */
/* on. The Assign walk offers Copy last Month first and then only     */
/* asks about what's left, including what to take back when Ready to  */
/* Assign went below zero. Each Category Group can be walked on its   */
/* own. On desktop the Assigned column is typed into directly, and a  */
/* panel under Ready to Assign explains whichever row has focus.      */
/* ------------------------------------------------------------------ */

function VariantD({ world: w, wide, change }: VariantProps) {
  type Open =
    | { kind: "steps"; title: string; ids: string[]; start: number }
    | { kind: "walk" }
    | { kind: "copy" }
    | { kind: "move" };
  const [open, setOpen] = useState<Open | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [explain, setExplain] = useState(true);
  const close = () => setOpen(null);

  const all = w.categories.map((x) => x.id);
  const browse = (id: string) =>
    setOpen({
      kind: "steps",
      title: "Categories",
      ids: all,
      start: all.indexOf(id),
    });
  const group = (g: string) =>
    setOpen({
      kind: "steps",
      title: `Assign ${g}`,
      ids: w.categories.filter((x) => x.group === g).map((x) => x.id),
      start: 0,
    });
  const focusRow = (id: string) =>
    document.querySelector<HTMLInputElement>(`#assign-${id}`)?.focus();

  const panel = open && (
    <Overlay
      wide={wide}
      side
      full
      label={
        open.kind === "steps"
          ? open.title
          : open.kind === "walk"
            ? `Assign ${MONTH}`
            : open.kind === "copy"
              ? `Copy ${LAST_MONTH}`
              : "Move money"
      }
      onClose={close}
    >
      {open.kind === "steps" && (
        <Steps
          world={w}
          wide={wide}
          initial={open.ids}
          start={open.start}
          change={change}
          onDone={close}
        />
      )}
      {open.kind === "walk" && (
        <Steps world={w} wide={wide} change={change} onDone={close} />
      )}
      {open.kind === "copy" && (
        <CopyPreview
          world={w}
          onCopy={(next, count) => {
            change(next, `Copied ${count} Assignments from ${LAST_MONTH}`);
            close();
          }}
        />
      )}
      {open.kind === "move" && (
        <MoveForm
          world={w}
          limited
          onMove={(from, to, amount) => {
            change(
              move(w, from, to, amount),
              `Moved ${money(amount)} from ${endName(w, from)} to ${endName(w, to)}`,
            );
            close();
          }}
        />
      )}
    </Overlay>
  );

  if (!wide)
    return (
      <>
        <PhoneBudget
          world={w}
          onAssign={() => setOpen({ kind: "walk" })}
          onCover={browse}
          onOpen={browse}
          onGroup={group}
        />
        {panel}
      </>
    );

  const x = focused ? w.byId(focused) : null;
  return (
    <>
      <DesktopBudget
        world={w}
        onAssign={() => setOpen({ kind: "walk" })}
        onCover={focusRow}
        onCopy={() => setOpen({ kind: "copy" })}
        onMove={() => setOpen({ kind: "move" })}
        onGroup={group}
        selected={focused ?? undefined}
        assignedCell={(c) => (
          <AssignField
            world={w}
            category={c}
            quiet
            onFocused={() => {
              setFocused(c.id);
              setTyped(null);
            }}
            onTyped={setTyped}
            saves={(n) => (w.rule === "a" ? n : Math.max(0, n))}
            onSet={(n) =>
              change(
                setTo(w, c.id, n),
                n >= 0 || w.rule === "a"
                  ? `Assigned ${money(n)} to ${c.name}`
                  : w.rule === "b"
                    ? `An Assignment can’t go below $0.00, so ${c.name} is now $0.00`
                    : `Took ${money(cents(w.assignment(c.id) - n))} back from ${c.name}`,
              )
            }
          />
        )}
        aside={
          explain ? (
            <div className="card asd-explain">
              <div className="split">
                <strong>{x ? x.name : "How Available adds up"}</strong>
                <button
                  type="button"
                  className="link small"
                  onClick={() => setExplain(false)}
                >
                  Hide
                </button>
              </div>
              {x ? (
                <Breakdown
                  world={w}
                  id={x.id}
                  amount={typed === null ? w.assignment(x.id) : parse(typed)}
                  onPick={(n) => {
                    change(
                      setTo(w, x.id, n),
                      `Assigned ${money(n)} to ${x.name}`,
                    );
                    const i = all.indexOf(x.id);
                    if (all[i + 1]) focusRow(all[i + 1]);
                  }}
                />
              ) : (
                <p className="muted small">
                  Click an amount in the Assigned column. This shows how that
                  Category’s Available is made up and what to assign. Enter, ↑
                  and ↓ move between Categories.
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="link small"
              onClick={() => setExplain(true)}
            >
              Show how Available adds up
            </button>
          )
        }
      />
      {panel}
    </>
  );
}

/** The walk's queue: what's Overspent, what has nothing assigned, then, if Ready to Assign is below zero, where to take money back from. */
function walkQueue(w: World): string[] {
  const queue = [
    ...w.overspent.map((x) => x.id),
    ...w.categories
      .filter((x) => !(x.id in w.assigned) && w.available(x.id) >= 0)
      .map((x) => x.id),
  ];
  if (w.readyToAssign < 0)
    queue.push(
      ...w.categories
        .filter((x) => !queue.includes(x.id) && w.movable(x.id) > 0)
        .sort((a, b) => w.available(b.id) - w.available(a.id))
        .map((x) => x.id),
    );
  return queue;
}

/** One Category at a time, without closing: ‹ ›, a swipe, or ↑ ↓ move along. */
function Steps({
  world: w,
  wide,
  initial,
  start = 0,
  change,
  onDone,
}: {
  world: World;
  /** On a phone, Back sits beside the main button instead of ‹ › up top. */
  wide: boolean;
  /** Categories to step through; none means the Assign walk. */
  initial?: string[];
  start?: number;
  change: VariantProps["change"];
  onDone(): void;
}) {
  const walk = !initial;
  const [ids, setIds] = useState<string[] | null>(
    initial ?? (w.copyable.length > 0 ? null : walkQueue(w)),
  );
  const [i, setI] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  const count = ids?.length ?? 0;
  const go = (to: number) => {
    if (to < 0) return;
    if (to >= count) {
      if (walk) setI(count);
      else onDone();
      return;
    }
    setI(to);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !ids) return;
    let x0 = 0;
    let y0 = 0;
    const down = (e: PointerEvent) => {
      x0 = e.clientX;
      y0 = e.clientY;
    };
    const up = (e: PointerEvent) => {
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 60 && Math.abs(e.clientY - y0) < 40)
        go(dx < 0 ? i + 1 : i - 1);
    };
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("select")) return;
      if (e.key === "ArrowDown") go(i + 1);
      else if (e.key === "ArrowUp") go(i - 1);
      else return;
      e.preventDefault();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("keydown", key);
    };
  });

  if (!ids)
    return (
      <>
        <div className="rt-body">
          <p>
            {w.copyable.length} Categories have nothing assigned in {MONTH} yet.
            Start them from what you assigned in {LAST_MONTH}, then check what’s
            left.
          </p>
          <CopyList world={w} onlyCopyable />
          <p className="small muted num">
            Ready to Assign after:{" "}
            <strong>
              {money(
                cents(
                  w.readyToAssign - w.copyable.reduce((s, x) => s + x.last, 0),
                ),
              )}
            </strong>
          </p>
        </div>
        <div className="rt-foot rt-save">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIds(walkQueue(w))}
          >
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary rt-save-main"
            onClick={() => {
              const next = copied(w);
              change(
                next,
                `Copied ${w.copyable.length} Assignments from ${LAST_MONTH}`,
              );
              setIds(walkQueue(worldOf(w.categories, next, w.rule)));
            }}
          >
            Copy {w.copyable.length} Assignments
          </button>
        </div>
      </>
    );

  if (i >= count)
    return (
      <>
        <div className="rt-body asb-done">
          <p className="asb-name">
            {count === 0 ? "Nothing needs a job." : "That’s every Category."}
          </p>
          <p className="muted">
            Ready to Assign is{" "}
            <strong className="num">{money(w.readyToAssign)}</strong>.
          </p>
          <RtaLine amount={w.readyToAssign} plain />
        </div>
        <div className="rt-foot">
          <button
            type="button"
            className="btn btn-primary btn-wide rt-save-main"
            onClick={onDone}
          >
            Done
          </button>
        </div>
      </>
    );

  const id = ids[i];
  const x = w.byId(id);
  return (
    <div className="asd" ref={ref}>
      <div className="asd-nav" data-wide={wide}>
        {wide && (
          <button
            type="button"
            className="asd-arrow"
            aria-label="Previous Category"
            disabled={i === 0}
            onClick={() => go(i - 1)}
          >
            ‹
          </button>
        )}
        <span className="asd-where">
          <strong className="asd-name">{x.name}</strong>
          <span className="small muted">
            {x.group} · {i + 1} of {count}
          </span>
        </span>
        {wide && (
          <button
            type="button"
            className="asd-arrow"
            aria-label="Next Category"
            disabled={i === count - 1 && !walk}
            onClick={() => go(i + 1)}
          >
            ›
          </button>
        )}
      </div>
      <div className="asd-rta num" data-state={stateOf(w.readyToAssign)}>
        <span>Ready to Assign</span>
        <strong>{money(w.readyToAssign)}</strong>
      </div>
      <StepPanel
        key={id}
        world={w}
        id={id}
        last={i === count - 1 && !walk}
        onSave={(next, toast) => {
          change(next, toast);
          go(i + 1);
        }}
        onNext={() => go(i + 1)}
        onBack={wide ? undefined : () => go(i - 1)}
        isFirst={i === 0}
        tip={
          wide
            ? "Suggestions save and move on. Use ‹ › or ↑ ↓ to look at another Category."
            : "Suggestions save and move on. Swipe to skip ahead or go back."
        }
      />
    </div>
  );
}

/** One Category in Steps: type and press Enter, or tap a suggestion. */
function StepPanel({
  world: w,
  id,
  last,
  onSave,
  onNext,
  onBack,
  isFirst,
  tip,
}: {
  world: World;
  id: string;
  last: boolean;
  onSave(next: Assigned, toast: string): void;
  onNext(): void;
  /** Back to the previous Category, beside the main button. */
  onBack?(): void;
  /** Back stays in place, disabled, so the main button doesn't change width. */
  isFirst: boolean;
  tip: string;
}) {
  const x = w.byId(id);
  const now = w.assignment(id);
  const short = Math.max(0, -w.available(id));
  const [source, setSource] = useState<End>(
    short > 0 && short > w.readyToAssign
      ? (w.categories.find((c) => c.id !== id && w.movable(c.id) >= short)
          ?.id ?? RTA)
      : RTA,
  );
  const fromRta = source === RTA;
  const [typed, setTyped] = useState(
    typedFrom(fromRta ? cents(now + short) : short),
  );
  const amount = parse(typed);
  const fieldId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);

  const unchanged = fromRta ? amount === now : amount === 0;
  // Rule b: only this Month's Assignment can leave a Category.
  const tooMuch = !fromRta && amount > w.movable(source);
  function saveWith(n: number) {
    if (fromRta)
      onSave(
        setTo(w, id, n),
        n < now
          ? `Took ${money(cents(now - n))} back from ${x.name}`
          : `Assigned ${money(n)} to ${x.name}`,
      );
    else
      onSave(
        move(w, source, id, n),
        `Moved ${money(n)} from ${endName(w, source)} to ${x.name}`,
      );
  }

  const giveBack = fromRta ? giveBackFor(w, id) : 0;
  const suggestions: [string, number][] = fromRta
    ? [
        ...(short > 0 && now + short !== amount
          ? [
              [
                `Cover it: ${money(cents(now + short))}`,
                cents(now + short),
              ] as [string, number],
            ]
          : []),
        ...(giveBack > 0
          ? [
              [`Give back ${money(giveBack)}`, cents(now - giveBack)] as [
                string,
                number,
              ],
            ]
          : []),
        ...(x.last > 0 && x.last !== now
          ? [[`${LAST_MONTH}: ${money(x.last)}`, x.last] as [string, number]]
          : []),
        ...(w.readyToAssign > 0
          ? [
              [
                `All of Ready to Assign: ${money(cents(now + w.readyToAssign))}`,
                cents(now + w.readyToAssign),
              ] as [string, number],
            ]
          : []),
      ]
    : short > 0 && amount !== short
      ? [[`Cover it: ${money(short)}`, short]]
      : [];

  const nextAvailable = cents(
    x.carried -
      w.takenBack(id) +
      (fromRta
        ? w.rule === "b"
          ? Math.max(0, amount)
          : amount
        : now + amount) -
      x.spending,
  );
  const sourceAfter = fromRta
    ? cents(w.readyToAssign - (amount - now))
    : cents(w.available(source) - amount);

  return (
    <form
      className="asd-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (unchanged) onNext();
        else saveWith(amount);
      }}
    >
      <div className="rt-body">
        <p className="asb-available num" data-state={stateOf(w.available(id))}>
          {money(w.available(id))}{" "}
          <span className="small">
            {short > 0 ? `Overspent by ${money(short)}` : "Available"}
          </span>
        </p>
        <dl className="asb-sum card num">
          <div>
            <dt>Carried forward from {LAST_MONTH}</dt>
            <dd>{money(x.carried)}</dd>
          </div>
          {w.takenBack(id) > 0 && (
            <div>
              <dt>Taken back from carried forward</dt>
              <dd>− {money(w.takenBack(id))}</dd>
            </div>
          )}
          <div>
            <dt>Assigned in {MONTH}</dt>
            <dd>{plusMinus(now)}</dd>
          </div>
          <div>
            <dt>Spending</dt>
            <dd>− {money(x.spending)}</dd>
          </div>
          <div className="asb-total">
            <dt>Available</dt>
            <dd>{money(w.available(id))}</dd>
          </div>
        </dl>

        <fieldset className="seg">
          <legend className="visually-hidden">
            Where the money comes from
          </legend>
          <button
            type="button"
            aria-pressed={fromRta}
            onClick={() => {
              setSource(RTA);
              setTyped(typedFrom(cents(now + short)));
            }}
          >
            Ready to Assign
          </button>
          <button
            type="button"
            aria-pressed={!fromRta}
            onClick={() => {
              const best = [...w.categories]
                .filter((c) => c.id !== id && w.movable(c.id) > 0)
                .sort((a, b) => w.movable(b.id) - w.movable(a.id))[0];
              if (best) setSource(best.id);
              setTyped(typedFrom(short));
            }}
          >
            Another Category
          </button>
        </fieldset>

        {!fromRta && (
          <label className="rt-field rt-account">
            <span className="small muted">Take it from</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {w.groups.map((g) => (
                <optgroup key={g} label={g}>
                  {w.categories
                    .filter((c) => c.group === g && c.id !== id)
                    .map((c) => (
                      <option
                        key={c.id}
                        value={c.id}
                        disabled={w.rule === "b" && w.movable(c.id) === 0}
                      >
                        {c.name} (
                        {w.rule === "b"
                          ? `${money(w.movable(c.id))} can move`
                          : `${money(w.available(c.id))} available`}
                        )
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        <div className="rt-field">
          <label className="small muted" htmlFor={fieldId}>
            {fromRta ? `Assigned in ${MONTH}` : `Move to ${x.name}`}
          </label>
          <span className="asb-amount num">
            $
            <input
              ref={input}
              id={fieldId}
              className="asb-input"
              inputMode="decimal"
              enterKeyHint={last ? "done" : "next"}
              placeholder="0"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </span>
          {suggestions.length > 0 && (
            <div className="rt-suggest">
              {suggestions.map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  className="chip chip-small"
                  onClick={() => saveWith(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rt-meter num">
          <div className="split">
            <span>{x.name} Available after</span>
            <strong data-state={stateOf(nextAvailable)}>
              {money(nextAvailable)}
            </strong>
          </div>
          <div className="split">
            <span>
              {fromRta ? "Ready to Assign" : `${endName(w, source)} Available`}{" "}
              after
            </span>
            <strong data-state={stateOf(sourceAfter)}>
              {money(sourceAfter)}
            </strong>
          </div>
        </div>
        {!fromRta && amount > 0 && (
          <p className="small asd-rule" data-error={tooMuch}>
            {tooMuch
              ? `${endName(w, source)} has ${money(w.movable(source))} assigned in ${MONTH} that can move. What it carried forward from earlier Months stays.`
              : lowerNote(w, source, amount)}
          </p>
        )}
        {fromRta && amount < 0 && (
          <p className="small asd-rule" data-error={w.rule === "b"}>
            {negativeNote(w, id, amount)}
          </p>
        )}
        <p className="small muted asd-tip">{tip}</p>
      </div>
      <div className="rt-foot rt-save">
        {onBack && (
          <button
            type="button"
            className="asd-arrow asd-back"
            aria-label="Previous Category"
            disabled={isFirst}
            onClick={onBack}
          >
            ‹
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary rt-save-main"
          disabled={tooMuch}
        >
          {unchanged
            ? last
              ? "Done"
              : "Next Category"
            : `${fromRta ? (amount < now ? "Take back" : "Assign") : "Move"} ${money(
                fromRta ? Math.abs(amount - now) || amount : amount,
              )}${last ? "" : " and next"}`}
        </button>
      </div>
    </form>
  );
}

/** D's desktop panel: the focused row's Available as it would be with what's typed. */
function Breakdown({
  world: w,
  id,
  amount,
  onPick,
}: {
  world: World;
  id: string;
  amount: number;
  onPick(n: number): void;
}) {
  const x = w.byId(id);
  const now = w.assignment(id);
  const available = cents(
    x.carried -
      w.takenBack(id) +
      (w.rule === "b" ? Math.max(0, amount) : amount) -
      x.spending,
  );
  const rta = cents(w.readyToAssign - (amount - now));
  const short = Math.max(0, -w.available(id));
  const giveBack = giveBackFor(w, id);
  const picks: [string, number][] = [
    ...(short > 0
      ? [
          [`Cover it: ${money(cents(now + short))}`, cents(now + short)] as [
            string,
            number,
          ],
        ]
      : []),
    ...(giveBack > 0
      ? [
          [`Give back ${money(giveBack)}`, cents(now - giveBack)] as [
            string,
            number,
          ],
        ]
      : []),
    ...(x.last > 0 && x.last !== now
      ? [[`${LAST_MONTH}: ${money(x.last)}`, x.last] as [string, number]]
      : []),
  ];
  return (
    <>
      <dl className="asb-sum num asd-sum">
        <div>
          <dt>Carried forward</dt>
          <dd>{money(x.carried)}</dd>
        </div>
        {w.takenBack(id) > 0 && (
          <div>
            <dt>Taken back</dt>
            <dd>− {money(w.takenBack(id))}</dd>
          </div>
        )}
        <div>
          <dt>Assigned in {MONTH}</dt>
          <dd data-changed={amount !== now}>{plusMinus(amount)}</dd>
        </div>
        <div>
          <dt>Spending</dt>
          <dd>− {money(x.spending)}</dd>
        </div>
        <div className="asb-total">
          <dt>Available</dt>
          <dd>
            <span className="pill" data-state={stateOf(available)}>
              {money(available)}
            </span>
          </dd>
        </div>
      </dl>
      {amount < 0 && (
        <p className="small asd-rule" data-error={w.rule === "b"}>
          {negativeNote(w, id, amount)}
        </p>
      )}
      <p className="small muted num">
        Ready to Assign {amount === now ? "is" : "after"}{" "}
        <strong data-state={stateOf(rta)}>{money(rta)}</strong>
      </p>
      {picks.length > 0 && (
        <div className="rt-suggest">
          {picks.map(([label, value]) => (
            <button
              key={label}
              type="button"
              className="chip chip-small"
              // Keep focus in the field, so it doesn't save what's typed first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shared by the variants                                             */
/* ------------------------------------------------------------------ */

/** Plain From / To / Amount, for the desktop header's Move money in A and B. */
function MoveForm({
  world: w,
  onMove,
  limited,
}: {
  world: World;
  onMove(from: End, to: End, amount: number): void;
  /** D: only what the rule lets leave a Category can move. */
  limited?: boolean;
}) {
  const [from, setFrom] = useState<End>(RTA);
  const [to, setTo] = useState<End>(w.overspent[0]?.id ?? w.categories[0].id);
  const [typed, setTyped] = useState(
    typedFrom(w.overspent[0] ? -w.available(w.overspent[0].id) : 0),
  );
  const amount = parse(typed);
  const tooMuch = limited === true && from !== RTA && amount > w.movable(from);
  const options = (
    <>
      <option value={RTA}>Ready to Assign ({money(w.readyToAssign)})</option>
      {w.groups.map((g) => (
        <optgroup key={g} label={g}>
          {w.categories
            .filter((c) => c.group === g)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({money(w.available(c.id))})
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onMove(from, to, amount);
      }}
    >
      <div className="rt-body">
        <label className="rt-field rt-account">
          <span className="small muted">From</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {options}
          </select>
        </label>
        <label className="rt-field rt-account">
          <span className="small muted">To</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {options}
          </select>
        </label>
        <label className="rt-field">
          <span className="small muted">Amount</span>
          <input
            inputMode="decimal"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        {limited && from !== RTA && from !== to && amount > 0 && (
          <p className="small asd-rule" data-error={tooMuch}>
            {tooMuch
              ? `${endName(w, from)} has ${money(w.movable(from))} that can move.`
              : lowerNote(w, from, amount)}
          </p>
        )}
        {from !== to && amount > 0 && (
          <p className="small muted num">
            {endName(w, from)} after:{" "}
            <strong>{money(cents(endAmount(w, from) - amount))}</strong>.{" "}
            {endName(w, to)} after:{" "}
            <strong>{money(cents(endAmount(w, to) + amount))}</strong>.
          </p>
        )}
      </div>
      <div className="rt-foot">
        <button
          type="submit"
          className="btn btn-primary btn-wide rt-save-main"
          disabled={from === to || amount <= 0 || tooMuch}
        >
          Move {money(amount)}
        </button>
      </div>
    </form>
  );
}

/** What Copy last Month would do, Category by Category. */
function CopyList({
  world: w,
  picked,
  onPick,
  onlyCopyable,
}: {
  world: World;
  onlyCopyable?: boolean;
  picked?: Set<string>;
  onPick?(id: string): void;
}) {
  const withLast = onlyCopyable
    ? w.copyable
    : w.categories.filter((x) => x.last > 0);
  return (
    <ul className="card rt-list asc-copy">
      {withLast.map((x) => {
        const copyable = !(x.id in w.assigned);
        const body = (
          <>
            <span className="rt-list-name">
              <strong>{x.name}</strong>
              <span className="small muted">
                {copyable
                  ? `${LAST_MONTH}: ${money(x.last)}`
                  : `Already ${money(w.assignment(x.id))} in ${MONTH}, kept`}
              </span>
            </span>
            <span className="num" data-muted={!copyable}>
              {copyable ? `+${money(x.last)}` : "—"}
            </span>
          </>
        );
        return (
          <li key={x.id}>
            {onPick && copyable ? (
              <label className="rt-list-row asc-copy-row">
                <input
                  type="checkbox"
                  className="asc-check"
                  checked={picked?.has(x.id) ?? false}
                  onChange={() => onPick(x.id)}
                />
                {body}
              </label>
            ) : (
              <div className="rt-list-row asc-copy-row" data-kept={!copyable}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CopyPreview({
  world: w,
  selectable,
  onCopy,
}: {
  world: World;
  selectable?: boolean;
  onCopy(next: Assigned, count: number): void;
}) {
  const [picked, setPicked] = useState(
    () => new Set(w.copyable.map((x) => x.id)),
  );
  const total = w.copyable
    .filter((x) => picked.has(x.id))
    .reduce((s, x) => s + x.last, 0);
  const after = cents(w.readyToAssign - total);
  return (
    <>
      <div className="rt-body">
        {w.copyable.length === 0 ? (
          <p>
            Every Category already has an Assignment in {MONTH}. Copy last Month
            only fills Categories that have none.
          </p>
        ) : (
          <p className="muted">
            Fills each Category with nothing assigned in {MONTH} with what you
            assigned in {LAST_MONTH}. Categories you’ve already assigned keep
            their amount.
          </p>
        )}
        <CopyList
          world={w}
          picked={picked}
          onPick={
            selectable
              ? (id) => {
                  const next = new Set(picked);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  setPicked(next);
                }
              : undefined
          }
        />
        <div className="rt-meter num">
          <div className="split">
            <span>Ready to Assign after</span>
            <strong data-state={stateOf(after)}>{money(after)}</strong>
          </div>
          {after < 0 && (
            <span className="small">
              That’s {money(-after)} more than you have. You can take it back
              from a Category afterwards.
            </span>
          )}
        </div>
      </div>
      <div className="rt-foot">
        <button
          type="button"
          className="btn btn-primary btn-wide rt-save-main"
          disabled={picked.size === 0}
          onClick={() => onCopy(copied(w, picked), picked.size)}
        >
          Copy {picked.size} Assignments
        </button>
      </div>
    </>
  );
}

/** A bottom sheet on a phone; a dialog, or a side panel, on a wide screen. */
function Overlay({
  wide,
  side,
  full,
  label,
  onClose,
  children,
}: {
  wide: boolean;
  side?: boolean;
  full?: boolean;
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
    <div className={wide ? "as-scrim" : "rt-scrim"} data-side={wide && side}>
      <div
        className={wide ? "as-dialog" : "rt-sheet"}
        data-side={wide && side}
        data-full={!wide && full}
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

function RtaLine({ amount, plain }: { amount: number; plain?: boolean }) {
  return (
    <p className={plain ? "small muted" : "small asa-bar-note"}>
      {amount < 0
        ? `You’ve assigned ${money(-amount)} more than you have. Take some back from a Category.`
        : amount === 0
          ? "Every dollar has a job."
          : "Give these dollars a job."}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* The Budget screen (#78, variant A, List) the flows start from      */
/* ------------------------------------------------------------------ */

function PhoneBudget({
  world: w,
  onAssign,
  onCover,
  onOpen,
  monthMenu,
  onGroup,
}: {
  world: World;
  onAssign(): void;
  onCover(id: string): void;
  onOpen?(id: string): void;
  monthMenu?: [string, () => void][];
  onGroup?(group: string): void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="stack">
      <header className="header">
        <h1 className="title">Budget</h1>
        <span className="asc-pop-host">
          <button
            type="button"
            className="month"
            aria-expanded={monthMenu ? menu : undefined}
            onClick={() => monthMenu && setMenu(!menu)}
          >
            {MONTH} 2026
            <Chevron />
          </button>
          {menu && monthMenu && (
            <div className="as-menu card" role="menu">
              {monthMenu.map(([label, act]) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  className="b-menu-item"
                  onClick={() => {
                    setMenu(false);
                    act();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </span>
      </header>
      <ReadyToAssign amount={w.readyToAssign} onAssign={onAssign} />
      {w.groups.map((g) => (
        <section key={g} className="a-group">
          <GroupHead world={w} group={g} onAssign={onGroup} />
          <ul className="card">
            {w.categories
              .filter((x) => x.group === g)
              .map((x) => {
                const n = w.available(x.id);
                const body = (
                  <>
                    <Tile name={x.name} />
                    <div className="a-row-body">
                      <div className="split">
                        <span className="a-name">{x.name}</span>
                        <span className="pill num" data-state={stateOf(n)}>
                          {money(n)}
                        </span>
                      </div>
                      <Bar world={w} category={x} />
                    </div>
                  </>
                );
                return (
                  <li
                    key={x.id}
                    className="a-row as-row"
                    data-state={stateOf(n)}
                  >
                    {onOpen ? (
                      <button
                        type="button"
                        className="as-row-open"
                        onClick={() => onOpen(x.id)}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="as-row-open">{body}</div>
                    )}
                    <RowNote world={w} category={x} onCover={onCover} />
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DesktopBudget({
  world: w,
  onAssign,
  onCover,
  onCopy,
  onMove,
  assignedCell,
  selected,
  aside,
  onGroup,
}: {
  world: World;
  onAssign(): void;
  onCover(id: string): void;
  onCopy(): void;
  onMove(): void;
  assignedCell(x: Category): ReactNode;
  selected?: string;
  /** Shown under Ready to Assign in the summary column. */
  aside?: ReactNode;
  onGroup?(group: string): void;
}) {
  return (
    <div className="a" data-wide>
      <header className="header">
        <h1 className="title">Budget</h1>
        <button type="button" className="month">
          {MONTH} 2026
          <Chevron />
        </button>
        <div className="header-actions">
          <button type="button" className="btn btn-quiet" onClick={onCopy}>
            Copy last Month
          </button>
          <button type="button" className="btn btn-secondary" onClick={onMove}>
            Move money
          </button>
        </div>
      </header>
      <div className="a-columns">
        <aside className="a-summary">
          <ReadyToAssign amount={w.readyToAssign} onAssign={onAssign} />
          {aside}
        </aside>
        <div className="a-table">
          <div className="a-table-head" aria-hidden>
            <span>Category</span>
            <span>Assigned</span>
            <span>Spending</span>
            <span>Available</span>
          </div>
          {w.groups.map((g) => (
            <section key={g} className="a-group card">
              <GroupHead world={w} group={g} onAssign={onGroup} />
              <ul>
                {w.categories
                  .filter((x) => x.group === g)
                  .map((x) => {
                    const n = w.available(x.id);
                    return (
                      <li
                        key={x.id}
                        className="a-trow"
                        data-state={stateOf(n)}
                        data-selected={selected === x.id}
                      >
                        <span className="a-tname">
                          <Tile name={x.name} />
                          <span>
                            <span className="a-name">{x.name}</span>
                            {x.carried !== 0 && (
                              <span className="a-carried muted small">
                                {" "}
                                {money(x.carried)} carried forward
                                {w.takenBack(x.id) > 0 &&
                                  `, ${money(w.takenBack(x.id))} taken back`}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="num">{assignedCell(x)}</span>
                        <span className="a-tspent">
                          <Bar world={w} category={x} />
                          <span className="num muted">{money(x.spending)}</span>
                        </span>
                        <span className="a-tavail">
                          <span className="pill num" data-state={stateOf(n)}>
                            {money(n)}
                          </span>
                          {n < 0 && (
                            <button
                              type="button"
                              className="link small"
                              onClick={() => onCover(x.id)}
                            >
                              Cover
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReadyToAssign({
  amount,
  onAssign,
}: {
  amount: number;
  onAssign(): void;
}) {
  return (
    <div className="hero rta">
      <p className="hero-label">Ready to Assign</p>
      <p className="display num">{money(amount)}</p>
      <div className="split rta-foot">
        <p className="hero-muted small">
          {amount < 0
            ? "You’ve assigned more than you have. Take some back."
            : amount === 0
              ? "Every dollar has a job."
              : "Give these dollars a job."}
        </p>
        <button type="button" className="btn btn-hero" onClick={onAssign}>
          Assign
        </button>
      </div>
    </div>
  );
}

function GroupHead({
  world: w,
  group,
  onAssign,
}: {
  world: World;
  group: string;
  onAssign?(group: string): void;
}) {
  const sum = w.categories
    .filter((x) => x.group === group)
    .reduce((s, x) => s + w.available(x.id), 0);
  return (
    <div className="split group-head">
      <h2>{group}</h2>
      {onAssign && (
        <button
          type="button"
          className="link small as-group-assign"
          onClick={() => onAssign(group)}
        >
          Assign {group}
        </button>
      )}
      <span className="muted small num">{money(sum)}</span>
    </div>
  );
}

function RowNote({
  world: w,
  category: x,
  onCover,
}: {
  world: World;
  category: Category;
  onCover(id: string): void;
}) {
  const n = w.available(x.id);
  const had = x.carried - w.takenBack(x.id) + w.assignment(x.id);
  if (n < 0)
    return (
      <p className="note note-over small as-note">
        <Warn /> Overspent by {money(-n)}
        <button type="button" className="link" onClick={() => onCover(x.id)}>
          Cover it
        </button>
      </p>
    );
  return (
    <p className="note muted small num as-note">
      {had === 0
        ? "Nothing assigned yet"
        : `${money(x.spending)} of ${money(had)} spent`}
      {w.assignment(x.id) < 0 &&
        ` · ${money(w.assignment(x.id))} assigned in ${MONTH}`}
      {w.takenBack(x.id) > 0 &&
        ` · ${money(w.takenBack(x.id))} taken back from carried forward`}
    </p>
  );
}

function Bar({ world: w, category: x }: { world: World; category: Category }) {
  const had = x.carried - w.takenBack(x.id) + w.assignment(x.id);
  const used = had <= 0 ? (x.spending > 0 ? 1 : 0) : x.spending / had;
  return (
    <span className="bar" data-over={w.available(x.id) < 0} aria-hidden>
      <i style={{ width: `${Math.min(used, 1) * 100}%` }} />
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
      </a>
      {["Checking", "Savings", "Cash"].map((name) => (
        <a key={name} className="rail-item rail-account" href={`#${name}`}>
          {name}
        </a>
      ))}
    </nav>
  );
}

function TabBar() {
  return (
    <nav className="tabs" aria-label="Places">
      <span className="tab" aria-current="page">
        <TabIcon d="M4 5h14M4 11h9M4 17h11" />
        Budget
      </span>
      <span className="tab">
        <TabIcon d="M3 12h4l3-7 4 14 3-7h3" />
        Activity
      </span>
      <button type="button" className="record" aria-label="Record">
        <Plus />
      </button>
      <span className="tab">
        <TabIcon d="M3 8h16v10H3zM3 8l3-4h10l3 4M14 13h2" />
        Accounts
      </span>
    </nav>
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
