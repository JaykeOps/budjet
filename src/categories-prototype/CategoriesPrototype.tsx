// PROTOTYPE (prototype/categories): throwaway. Three ways to create, rename,
// reorder, hide, unhide and delete Categories and Category Groups, for "How
// does the user manage Categories and Category Groups?" (#85). Switch with
// `?cats=A|B|C`. `?data=typical|new|blank`, `?frame=phone|desktop`,
// `?scheme=system|dark|light`. Everything is in memory.
// A, Edit mode (chosen): Edit turns the Budget screen into an editable list. Drag a
//    handle, or arrow keys on it; hidden Categories stay in place, dimmed.
// B, Categories screen: its own screen off the Budget, with a list and a
//    detail page. Reorder is tap to pick up, tap to place. Hidden has a section.
// C, In the Category sheet: no mode and no screen. The Category sheet gains
//    Manage, a Group has its own sheet, Add sits at the foot of each Group.
import "@fontsource-variable/geist";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useUrlParameter } from "../url-parameter";
import "../budget-screen-prototype/prototype.css";
import "../record-prototype/record.css";
import "../first-run-prototype/first-run.css";
import "./categories.css";

type VariantKey = "A" | "B" | "C";
const keys: VariantKey[] = ["A", "B", "C"];
const names = {
  A: "Edit mode",
  B: "Categories screen",
  C: "In the Category sheet",
};

type Category = {
  id: string;
  name: string;
  carried: number;
  assigned: number;
  spent: number;
  hidden: boolean;
  used: boolean;
  later: number;
};
type Group = { id: string; name: string; categories: Category[] };
type World = { readyToAssign: number; groups: Group[] };

let nextId = 1;
const newId = () => `new-${nextId++}`;
const cat = (
  name: string,
  assigned = 0,
  spent = 0,
  more: Partial<Category> = {},
): Category => ({
  id: name,
  name,
  carried: 0,
  assigned,
  spent,
  hidden: false,
  used: assigned !== 0 || spent !== 0,
  later: 0,
  ...more,
});
const starterSet: Group[] = [
  {
    id: "Bills",
    name: "Bills",
    categories: ["Rent", "Power", "Phone", "Internet"].map((n) => cat(n)),
  },
  {
    id: "Everyday",
    name: "Everyday",
    categories: ["Groceries", "Transport", "Dining Out"].map((n) => cat(n)),
  },
  {
    id: "Savings",
    name: "Savings",
    categories: [cat("Emergency Fund")],
  },
];
function worldFor(data: string): World {
  if (data === "blank") return { readyToAssign: 2400, groups: [] };
  if (data === "new") return { readyToAssign: 2400, groups: starterSet };
  return {
    readyToAssign: 340,
    groups: [
      {
        id: "Bills",
        name: "Bills",
        categories: [
          cat("Rent", 1200, 1200),
          cat("Power", 90, 64),
          cat("Phone", 40, 40),
          cat("Streaming", 0, 0, { used: true, later: 15 }),
        ],
      },
      {
        id: "Everyday",
        name: "Everyday",
        categories: [
          cat("Groceries", 600, 412.4),
          cat("Transport", 120, 46),
          cat("Dining Out", 60, 78),
          cat("Gifts"),
          cat("Old Car Loan", 0, 0, { hidden: true, used: true }),
        ],
      },
      {
        id: "Savings",
        name: "Savings",
        categories: [
          cat("Emergency Fund", 200, 0, { carried: 3000 }),
          cat("Holiday", 150, 0, { carried: 600 }),
        ],
      },
      {
        id: "Health",
        name: "Health",
        categories: [
          cat("Gym", 0, 0, { hidden: true, used: true, carried: 12.5 }),
        ],
      },
      { id: "Kids", name: "Kids", categories: [] },
    ],
  };
}

const fmt = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);
const left = (c: Category) => c.carried + c.assigned - c.spent;
const visible = (g: Group) => g.categories.filter((c) => !c.hidden);
const hiddenOf = (w: World) =>
  w.groups.flatMap((g) =>
    g.categories.filter((c) => c.hidden).map((c) => ({ c, g })),
  );
const findCat = (w: World, id: string) => {
  for (const g of w.groups) {
    const c = g.categories.find((x) => x.id === id);
    if (c) return { c, g };
  }
  return undefined;
};
const editCat = (w: World, id: string, change: Partial<Category>): World => ({
  ...w,
  groups: w.groups.map((g) => ({
    ...g,
    categories: g.categories.map((c) =>
      c.id === id ? { ...c, ...change } : c,
    ),
  })),
});
function moveCat(
  w: World,
  id: string,
  groupId: string,
  toIndex: number,
): World {
  const found = findCat(w, id);
  if (!found) return w;
  return {
    ...w,
    groups: w.groups.map((g) => {
      const others = g.categories.filter((c) => c.id !== id);
      return {
        ...g,
        categories:
          g.id === groupId ? others.toSpliced(toIndex, 0, found.c) : others,
      };
    }),
  };
}
function moveGroup(w: World, id: string, toIndex: number): World {
  const g = w.groups.find((x) => x.id === id);
  if (!g) return w;
  return {
    ...w,
    groups: w.groups.filter((x) => x.id !== id).toSpliced(toIndex, 0, g),
  };
}
/** One step up or down, crossing into the next Group at the ends. */
function stepCat(
  w: World,
  id: string,
  by: -1 | 1,
  withHidden: boolean,
): World | null {
  const found = findCat(w, id);
  if (!found) return null;
  const { g } = found;
  const list = withHidden ? g.categories : visible(g);
  const others = g.categories.filter((c) => c.id !== id);
  const target = list[list.findIndex((c) => c.id === id) + by];
  if (target) {
    const at = others.findIndex((c) => c.id === target.id);
    return moveCat(w, id, g.id, by < 0 ? at : at + 1);
  }
  const next = w.groups[w.groups.findIndex((x) => x.id === g.id) + by];
  if (!next) return null;
  return moveCat(w, id, next.id, by < 0 ? next.categories.length : 0);
}
function stepGroup(w: World, id: string, by: -1 | 1): World | null {
  const at = w.groups.findIndex((g) => g.id === id) + by;
  return at < 0 || at >= w.groups.length ? null : moveGroup(w, id, at);
}
/** Empties a Category's Available into another Category or Ready to Assign. */
function moveOut(w: World, id: string, to: string): World {
  const found = findCat(w, id);
  if (!found) return w;
  const amount = left(found.c);
  const emptied = editCat(w, id, {
    carried: found.c.carried - amount,
  });
  if (to === "rta")
    return { ...emptied, readyToAssign: emptied.readyToAssign + amount };
  const target = findCat(emptied, to);
  return target
    ? editCat(emptied, to, { assigned: target.c.assigned + amount })
    : emptied;
}

type Act = {
  set(change: (w: World) => World): void;
  /** A change the user can Undo, with what the real command would be. */
  commit(next: World, message: string, command: string): void;
  log(command: string): void;
  say(message: string): void;
  toast(message: string): void;
};
type Props = { w: World; wide: boolean; act: Act };

export function CategoriesPrototype() {
  const [catsParam, setCats] = useUrlParameter("cats");
  const [frameParam, setFrame] = useUrlParameter("frame");
  const [schemeParam, setScheme] = useUrlParameter("scheme");
  const [dataParam, setData] = useUrlParameter("data");
  const v: VariantKey = keys.includes(catsParam as VariantKey)
    ? (catsParam as VariantKey)
    : "A";
  const frame = frameParam === "desktop" ? "desktop" : "phone";
  const scheme = schemeParam ?? "system";
  const data = dataParam ?? "typical";
  const wide = frame === "desktop";

  const [w, setW] = useState(() => worldFor(data));
  const [run, setRun] = useState(0);
  const [toast, setToast] = useState<{ text: string; undo?: World } | null>(
    null,
  );
  const [command, setCommand] = useState("nothing yet");
  const [spoken, setSpoken] = useState("");

  useEffect(() => {
    setW(worldFor(data));
    setRun((r) => r + 1);
  }, [data]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      if (el.dataset.handle) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function cycle(by: number) {
    setCats(keys[(keys.indexOf(v) + by + keys.length) % keys.length], "push");
  }

  const act: Act = {
    set: setW,
    commit(next, message, cmd) {
      setToast({ text: message, undo: w });
      setW(next);
      setCommand(cmd);
    },
    log: setCommand,
    say: setSpoken,
    toast: (text) => setToast({ text }),
  };
  const props = { w, wide, act };
  const screen = (
    <div key={`${v}-${run}`}>
      {v === "A" && <VariantA {...props} />}
      {v === "B" && <VariantB {...props} />}
      {v === "C" && <VariantC {...props} />}
    </div>
  );
  const overlays = (
    <>
      <p className="ct-live" aria-live="polite">
        {spoken}
      </p>
      {toast && (
        <div className="rt-toast ct-toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="rt-toast-undo"
              onClick={() => {
                if (toast.undo) setW(toast.undo);
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="bs rt fr ct" data-scheme={scheme} data-frame={frame}>
      {wide ? (
        <div className="bs-desktop">
          <Rail act={act} />
          <main className="bs-main">{screen}</main>
          {overlays}
        </div>
      ) : (
        <div className="bs-device">
          <div className="bs-phone">
            {screen}
            <TabBar act={act} />
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
            value={data}
            onChange={(e) => setData(e.target.value, "replace")}
            aria-label="Data"
          >
            <option value="typical">In use</option>
            <option value="new">Starter set</option>
            <option value="blank">No Categories</option>
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
              setW(worldFor(data));
              setRun(run + 1);
              setCommand("nothing yet");
            }}
          >
            Reset
          </button>
          <span className="ct-command" title="The real command this would call">
            {command}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ shared parts ------------------------ */

function Rail({ act }: { act: Act }) {
  const stub = () => act.toast("Not part of this prototype");
  return (
    <nav className="rail" aria-label="Places">
      <button type="button" className="btn btn-primary btn-wide" onClick={stub}>
        + Record
      </button>
      <a className="rail-item" aria-current="page" href="?">
        Budget
      </a>
      <p className="rail-head muted small">Accounts</p>
      <span className="rail-item">
        <span>All Accounts</span>
        <span className="num muted small">{fmt(6223.5)}</span>
      </span>
      <span className="rail-item">
        <span>Everyday</span>
        <span className="num muted small">{fmt(2223.5)}</span>
      </span>
      <span className="rail-item">
        <span>Savings</span>
        <span className="num muted small">{fmt(4000)}</span>
      </span>
    </nav>
  );
}

function TabBar({ act }: { act: Act }) {
  const stub = () => act.toast("Not part of this prototype");
  return (
    <nav className="tabs" aria-label="Places">
      <button type="button" className="tab ct-tab" aria-current="page">
        Budget
      </button>
      <button type="button" className="tab ct-tab" onClick={stub}>
        Activity
      </button>
      <button
        type="button"
        className="record"
        aria-label="Record"
        onClick={stub}
      >
        +
      </button>
      <button type="button" className="tab ct-tab" onClick={stub}>
        Accounts
      </button>
    </nav>
  );
}

/** A bottom sheet on a phone, a side panel on desktop. */
function Sheet({
  title,
  wide,
  onClose,
  children,
}: {
  title: string;
  wide: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={wide ? "ct-panel-scrim" : "rt-scrim"}>
      <div
        ref={ref}
        tabIndex={-1}
        className={wide ? "ct-panel" : "rt-sheet ct-sheet"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="split ct-sheet-head">
          <h2 className="ct-sheet-title">{title}</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="ct-sheet-body">{children}</div>
      </div>
    </div>
  );
}

function NameField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave(name: string): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    else setDraft(value);
  };
  return (
    <label className="fr-field">
      <span className="muted small">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

function otherCategories(w: World, except: string) {
  const home = findCat(w, except)?.g.id;
  const ordered = [
    ...w.groups.filter((g) => g.id === home),
    ...w.groups.filter((g) => g.id !== home),
  ];
  return ordered.flatMap((g) =>
    visible(g)
      .filter((c) => c.id !== except)
      .map((c) => ({ c, g })),
  );
}

/**
 * Hiding never makes money vanish (`hideCategory` refuses otherwise), so the
 * money goes somewhere first, as one step. Also how a hidden Category that
 * has gained money, from an edit to an old Transaction, gets rid of it.
 */
function MoveOutFlow({
  c,
  w,
  act,
  hide,
  onDone,
  onCancel,
}: {
  c: Category;
  w: World;
  act: Act;
  hide: boolean;
  onDone(): void;
  onCancel(): void;
}) {
  const amount = left(c);
  const [to, setTo] = useState("rta");
  const others = otherCategories(w, c.id).filter(
    (x) => amount > 0 || left(x.c) >= -amount,
  );
  const verb = amount > 0 ? "Move" : "Cover";
  const apply = () => {
    let next = amount !== 0 ? moveOut(w, c.id, to) : w;
    if (hide && c.later) {
      next = {
        ...editCat(next, c.id, { later: 0 }),
        readyToAssign: next.readyToAssign + c.later,
      };
    }
    if (hide) next = editCat(next, c.id, { hidden: true });
    const words = hide
      ? `Hid ${c.name}`
      : amount > 0
        ? `Moved ${fmt(amount)} out of ${c.name}`
        : `Covered ${c.name}`;
    act.commit(
      next,
      words,
      [
        amount !== 0 && "moveMoney",
        hide && c.later > 0 && "setAssignment(Nov, 0)",
        hide && "hideCategory",
      ]
        .filter(Boolean)
        .join(" + "),
    );
    onDone();
  };
  return (
    <div className="stack ct-flow">
      {amount > 0 && (
        <p>
          <b>{c.name}</b> has <b className="num">{fmt(amount)}</b> Available.
          {hide ? " Move it first, so it isn't left out of sight." : ""}
        </p>
      )}
      {amount < 0 && (
        <p>
          <b>{c.name}</b> is Overspent by <b className="num">{fmt(-amount)}</b>.
          {hide ? " Cover it first, so it isn't left out of sight." : ""}
        </p>
      )}
      {amount !== 0 && (
        <label className="fr-field">
          <span className="muted small">
            {amount > 0 ? "Move it to" : "Cover it from"}
          </span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="rta">
              Ready to Assign ({fmt(w.readyToAssign)})
            </option>
            {others.map(({ c: o, g }) => (
              <option key={o.id} value={o.id}>
                {o.name}, {g.name} ({fmt(left(o))})
              </option>
            ))}
          </select>
        </label>
      )}
      {hide && c.later > 0 && (
        <p>
          {c.name} also has <b className="num">{fmt(c.later)}</b> assigned in
          November. Hiding sets that to $0.00, and it goes back to Ready to
          Assign.
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={apply}
      >
        {amount !== 0
          ? `${verb} ${fmt(Math.abs(amount))}${hide ? " and hide" : ""}`
          : "Set to $0.00 and hide"}
      </button>
      <button type="button" className="btn btn-quiet" onClick={onCancel}>
        Keep {c.name} as it is
      </button>
    </div>
  );
}

/** Hide, unhide and delete, with the rules the commands enforce. */
function CategoryFate({
  c,
  w,
  act,
  onDone,
}: {
  c: Category;
  w: World;
  act: Act;
  onDone(): void;
}) {
  const [flow, setFlow] = useState<"hide" | "out" | null>(null);
  if (flow)
    return (
      <MoveOutFlow
        c={c}
        w={w}
        act={act}
        hide={flow === "hide"}
        onDone={onDone}
        onCancel={() => setFlow(null)}
      />
    );
  const money = left(c);
  const hide = () => {
    if (money !== 0 || c.later > 0) return setFlow("hide");
    act.commit(
      editCat(w, c.id, { hidden: true }),
      `Hid ${c.name}`,
      "hideCategory",
    );
    onDone();
  };
  const remove = () => {
    act.commit(
      {
        ...w,
        groups: w.groups.map((g) => ({
          ...g,
          categories: g.categories.filter((x) => x.id !== c.id),
        })),
      },
      `Deleted ${c.name}`,
      "deleteCategory",
    );
    onDone();
  };
  return (
    <div className="stack ct-fate">
      {c.hidden && (
        <>
          <p className="muted small">
            Hidden: {c.name} is out of the Budget and the Category pickers. Its
            history stays.
          </p>
          {money !== 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-wide"
              onClick={() => setFlow("out")}
            >
              {money > 0
                ? `Move its ${fmt(money)}`
                : `Cover its ${fmt(-money)}`}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-wide"
            onClick={() => {
              act.commit(
                editCat(w, c.id, { hidden: false }),
                `${c.name} is back`,
                "unhideCategory",
              );
              onDone();
            }}
          >
            Unhide
          </button>
        </>
      )}
      {!c.hidden && (
        <button
          type="button"
          className="btn btn-secondary btn-wide"
          onClick={hide}
        >
          Hide {c.name}
        </button>
      )}
      {c.used ? (
        <p className="muted small">
          {c.name} can't be deleted, because it has Transactions or Assignments.
          {c.hidden ? "" : " Hide it instead: its history stays."}
        </p>
      ) : (
        <button
          type="button"
          className="btn btn-quiet ct-danger"
          onClick={remove}
        >
          Delete {c.name}
        </button>
      )}
    </div>
  );
}

function GroupPicker({
  c,
  g,
  w,
  act,
}: {
  c: Category;
  g: Group;
  w: World;
  act: Act;
}) {
  return (
    <label className="fr-field">
      <span className="muted small">Category Group</span>
      <select
        value={g.id}
        onChange={(e) => {
          const to = w.groups.find((x) => x.id === e.target.value);
          if (!to) return;
          act.set((old) => moveCat(old, c.id, to.id, to.categories.length));
          act.log("moveCategory");
        }}
      >
        {w.groups.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Steps({
  onUp,
  onDown,
  where,
}: {
  onUp?: () => void;
  onDown?: () => void;
  where: string;
}) {
  return (
    <div className="ct-steps">
      <span className="muted small">{where}</span>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!onUp}
        onClick={onUp}
      >
        ↑ Up
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!onDown}
        onClick={onDown}
      >
        ↓ Down
      </button>
    </div>
  );
}

function CategorySteps({
  c,
  g,
  w,
  act,
  withHidden,
}: {
  c: Category;
  g: Group;
  w: World;
  act: Act;
  withHidden: boolean;
}) {
  const step = (by: -1 | 1) => {
    const next = stepCat(w, c.id, by, withHidden);
    if (!next) return undefined;
    return () => {
      act.set(() => next);
      act.log("moveCategory");
    };
  };
  const list = withHidden ? g.categories : visible(g);
  return (
    <Steps
      where={`${list.findIndex((x) => x.id === c.id) + 1} of ${list.length} in ${g.name}`}
      onUp={step(-1)}
      onDown={step(1)}
    />
  );
}

/** Rename, reorder and delete a Group, with the rule the command enforces. */
function GroupFate({
  g,
  w,
  act,
  onDone,
}: {
  g: Group;
  w: World;
  act: Act;
  onDone(): void;
}) {
  const others = w.groups.filter((x) => x.id !== g.id);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const remove = (next: World, command: string) => {
    act.commit(
      { ...next, groups: next.groups.filter((x) => x.id !== g.id) },
      `Deleted ${g.name}`,
      command,
    );
    onDone();
  };
  if (g.categories.length === 0)
    return (
      <button
        type="button"
        className="btn btn-quiet ct-danger"
        onClick={() => remove(w, "deleteCategoryGroup")}
      >
        Delete {g.name}
      </button>
    );
  const onlyHidden = visible(g).length === 0;
  return (
    <div className="stack ct-fate">
      <p className="muted small">
        {g.name} can't be deleted while it holds{" "}
        {onlyHidden
          ? `${g.categories.map((c) => c.name).join(", ")}, ${g.categories.length === 1 ? "which is" : "which are"} hidden`
          : `${g.categories.length} Categories`}
        . Move them first.
      </p>
      {others.length > 0 && (
        <>
          <label className="fr-field">
            <span className="muted small">Move them to</span>
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {others.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-wide"
            onClick={() => {
              const moved = g.categories.reduce((world, c) => {
                const target = world.groups.find((x) => x.id === to);
                return target
                  ? moveCat(world, c.id, to, target.categories.length)
                  : world;
              }, w);
              remove(moved, "moveCategory × n + deleteCategoryGroup");
            }}
          >
            Move them and delete {g.name}
          </button>
        </>
      )}
    </div>
  );
}

function GroupSteps({ g, w, act }: { g: Group; w: World; act: Act }) {
  const step = (by: -1 | 1) => {
    const next = stepGroup(w, g.id, by);
    if (!next) return undefined;
    return () => {
      act.set(() => next);
      act.log("moveCategoryGroup");
    };
  };
  return (
    <Steps
      where={`${w.groups.findIndex((x) => x.id === g.id) + 1} of ${w.groups.length} Groups`}
      onUp={step(-1)}
      onDown={step(1)}
    />
  );
}

const addCategoryTo = (
  w: World,
  groupId: string,
  name: string,
  id: string,
) => ({
  ...w,
  groups: w.groups.map((g) =>
    g.id === groupId
      ? { ...g, categories: [...g.categories, { ...cat(name), id }] }
      : g,
  ),
});

/** Puts the cursor in a field the user just opened to type in. */
function useFocusOnOpen() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

/** Name and Group, for when no Group is in view (and there may be none yet). */
function AddSheet({
  w,
  wide,
  act,
  onClose,
  onAdded,
}: Props & { onClose(): void; onAdded?(id: string): void }) {
  const focusOnOpen = useFocusOnOpen();
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState(w.groups[0]?.id ?? "new");
  const [groupName, setGroupName] = useState("");
  const newGroup = groupId === "new";
  const ready = name.trim() && (!newGroup || groupName.trim());
  return (
    <Sheet title="Add a Category" wide={wide} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          const id = newId();
          const gid = newGroup ? newId() : groupId;
          const base: World = newGroup
            ? {
                ...w,
                groups: [
                  ...w.groups,
                  { id: gid, name: groupName.trim(), categories: [] },
                ],
              }
            : w;
          act.commit(
            addCategoryTo(base, gid, name.trim(), id),
            `Added ${name.trim()}`,
            newGroup
              ? "createCategoryGroup + createCategory"
              : "createCategory",
          );
          onClose();
          onAdded?.(id);
        }}
      >
        <label className="fr-field">
          <span className="muted small">Name</span>
          <input
            ref={focusOnOpen}
            value={name}
            placeholder="Groceries"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {w.groups.length > 0 && (
          <label className="fr-field">
            <span className="muted small">Category Group</span>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {w.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="new">New Category Group…</option>
            </select>
          </label>
        )}
        {newGroup && (
          <label className="fr-field">
            <span className="muted small">New Category Group</span>
            <input
              value={groupName}
              placeholder="Everyday"
              onChange={(e) => setGroupName(e.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-wide"
          disabled={!ready}
        >
          Add Category
        </button>
      </form>
    </Sheet>
  );
}

/** One line to name a new thing, staying open so several can be added. */
function InlineAdd({
  label,
  onAdd,
}: {
  label: string;
  onAdd(name: string): void;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        className="link ct-add"
        onClick={() => setOpen(true)}
      >
        + {label}
      </button>
    );
  return (
    <InlineAddForm label={label} onAdd={onAdd} onClose={() => setOpen(false)} />
  );
}

function InlineAddForm({
  label,
  onAdd,
  onClose,
}: {
  label: string;
  onAdd(name: string): void;
  onClose(): void;
}) {
  const focusOnOpen = useFocusOnOpen();
  const [name, setName] = useState("");
  return (
    <form
      className="ct-inline-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onAdd(name.trim());
        setName("");
      }}
    >
      <input
        ref={focusOnOpen}
        aria-label={label}
        value={name}
        placeholder={label}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => !name.trim() && onClose()}
      />
      <button type="submit" className="btn btn-secondary">
        Add
      </button>
    </form>
  );
}

/** Tap a slot to place what was picked up. Works by tap, mouse and keyboard. */
function PlaceList({
  w,
  lifted,
  onPlace,
  onCancel,
}: {
  w: World;
  lifted: { kind: "category" | "group"; id: string };
  onPlace(groupId: string, toIndex: number): void;
  onCancel(): void;
}) {
  const slot = (key: string, groupId: string, toIndex: number) => (
    <li key={key}>
      <button
        type="button"
        className="ct-slot"
        onClick={() => onPlace(groupId, toIndex)}
      >
        Put here
      </button>
    </li>
  );
  const name =
    lifted.kind === "group"
      ? w.groups.find((g) => g.id === lifted.id)?.name
      : findCat(w, lifted.id)?.c.name;
  const head = (
    <div className="split ct-place-head">
      <span>
        Where should <b>{name}</b> go?
      </span>
      <button type="button" className="link" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
  if (lifted.kind === "group") {
    const others = w.groups.filter((g) => g.id !== lifted.id);
    return (
      <div className="stack">
        {head}
        <ul className="ct-place">
          {slot("start", "", 0)}
          {others.flatMap((g, i) => [
            <li key={g.id} className="ct-place-row">
              {g.name}
            </li>,
            slot(`after-${g.id}`, "", i + 1),
          ])}
        </ul>
      </div>
    );
  }
  return (
    <div className="stack">
      {head}
      {w.groups.map((g) => {
        const others = g.categories.filter((c) => c.id !== lifted.id);
        const shown = others.filter((c) => !c.hidden);
        return (
          <section key={g.id}>
            <h3 className="ct-place-group">{g.name}</h3>
            <ul className="ct-place">
              {slot(`${g.id}-start`, g.id, 0)}
              {shown.flatMap((c) => [
                <li key={c.id} className="ct-place-row">
                  {c.name}
                </li>,
                slot(`${c.id}-after`, g.id, others.indexOf(c) + 1),
              ])}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------ Budget ------------------------------ */

function summary(w: World) {
  return (
    <section className="hero rta">
      <span className="hero-label">Ready to Assign</span>
      <span className="display num">{fmt(w.readyToAssign)}</span>
      <div className="split rta-foot">
        <span className="hero-muted small">Give these dollars a job.</span>
        <button type="button" className="btn btn-hero">
          Assign
        </button>
      </div>
    </section>
  );
}

function CategoryRow({
  c,
  wide,
  onOpen,
}: {
  c: Category;
  wide: boolean;
  onOpen?: () => void;
}) {
  const has = c.carried + c.assigned;
  const money = left(c);
  const state = money < 0 ? "overspent" : money === 0 ? "zero" : "funded";
  const width = `${has > 0 ? Math.min(c.spent / has, 1) * 100 : c.spent > 0 ? 100 : 0}%`;
  const name = onOpen ? (
    <button type="button" className="ct-rowbtn a-name" onClick={onOpen}>
      {c.name}
    </button>
  ) : (
    <span className="a-name">{c.name}</span>
  );
  if (wide)
    return (
      <li className="a-trow" data-state={state}>
        <span className="a-tname">
          <span className="tile" aria-hidden>
            {c.name[0]}
          </span>
          {name}
        </span>
        <span className="num">
          <span className="a-assigned ct-assigned">{fmt(c.assigned)}</span>
        </span>
        <span className="a-tspent">
          <span className="bar" data-over={money < 0} aria-hidden>
            <i style={{ width }} />
          </span>
          <span className="num muted">{fmt(c.spent)}</span>
        </span>
        <span className="a-tavail">
          <span className="pill num" data-state={state}>
            {fmt(money)}
          </span>
        </span>
      </li>
    );
  return (
    <li className="a-row" data-state={state}>
      <span className="tile" aria-hidden>
        {c.name[0]}
      </span>
      <div className="a-row-body">
        <div className="split">
          {name}
          <span className="pill num" data-state={state}>
            {fmt(money)}
          </span>
        </div>
        <span className="bar" data-over={money < 0} aria-hidden>
          <i style={{ width }} />
        </span>
        {money < 0 ? (
          <p className="note note-over small">
            Overspent by {fmt(-money)}
            <button type="button" className="link">
              Cover it
            </button>
          </p>
        ) : has === 0 ? (
          <p className="note muted small">Nothing assigned yet</p>
        ) : (
          <p className="note muted small num">
            {fmt(c.spent)} of {fmt(has)} spent
          </p>
        )}
      </div>
    </li>
  );
}

/** A hidden Category holding money would otherwise be out of sight. */
function HiddenMoneyNotice({ w, wide, act }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const holding = hiddenOf(w).filter(({ c }) => left(c) !== 0);
  const target = holding.find(({ c }) => c.id === open);
  if (holding.length === 0) return null;
  return (
    <>
      {holding.map(({ c }) => (
        <p key={c.id} className="fr-coach ct-notice">
          <span>
            <b>{c.name}</b> is hidden and{" "}
            {left(c) > 0
              ? `has ${fmt(left(c))} Available.`
              : `is Overspent by ${fmt(-left(c))}.`}
          </span>
          <button type="button" className="link" onClick={() => setOpen(c.id)}>
            {left(c) > 0 ? "Move it" : "Cover it"}
          </button>
        </p>
      ))}
      {target && (
        <Sheet
          title={`Sort out ${target.c.name}`}
          wide={wide}
          onClose={() => setOpen(null)}
        >
          <MoveOutFlow
            c={target.c}
            w={w}
            act={act}
            hide={false}
            onDone={() => setOpen(null)}
            onCancel={() => setOpen(null)}
          />
        </Sheet>
      )}
    </>
  );
}

function NoCategories({
  w,
  wide,
  act,
  onAdded,
}: Props & { onAdded?(id: string): void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="card ct-empty">
      <p>
        No Categories yet. A Category is a job for your money, like Rent or
        Groceries.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-wide"
        onClick={() => setAdding(true)}
      >
        Add a Category
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() =>
          act.commit(
            { ...w, groups: starterSet },
            "Added the starter set",
            "addStarterSet",
          )
        }
      >
        Use the starter set
      </button>
      {adding && (
        <AddSheet
          w={w}
          wide={wide}
          act={act}
          onClose={() => setAdding(false)}
          onAdded={onAdded}
        />
      )}
    </div>
  );
}

function BudgetView({
  w,
  wide,
  act,
  actions,
  groupsSlot,
  onOpen,
  groupHead,
  groupFoot,
  showEmptyGroups,
  footer,
  onAdded,
}: Props & {
  actions?: ReactNode;
  groupsSlot?: ReactNode;
  onOpen?(c: Category): void;
  groupHead?(g: Group): ReactNode;
  groupFoot?(g: Group): ReactNode;
  showEmptyGroups?: boolean;
  footer?: ReactNode;
  onAdded?(id: string): void;
}) {
  const shown = w.groups.filter(
    (g) => showEmptyGroups || visible(g).length > 0,
  );
  const body = groupsSlot ?? (
    <div className="stack">
      <HiddenMoneyNotice w={w} wide={wide} act={act} />
      {w.groups.length === 0 && (
        <NoCategories w={w} wide={wide} act={act} onAdded={onAdded} />
      )}
      {wide && w.groups.length > 0 && (
        <div className="a-table-head" aria-hidden>
          <span>Category</span>
          <span>Assigned</span>
          <span>Spending</span>
          <span>Available</span>
        </div>
      )}
      {shown.map((g) => (
        <section key={g.id} className={wide ? "a-group card" : "a-group"}>
          <div className="split group-head">
            {groupHead ? groupHead(g) : <h2>{g.name}</h2>}
            <span className="muted small num">
              {fmt(visible(g).reduce((s, c) => s + left(c), 0))}
            </span>
          </div>
          <ul className={wide ? undefined : "card"}>
            {visible(g).map((c) => (
              <CategoryRow
                key={c.id}
                c={c}
                wide={wide}
                onOpen={onOpen && (() => onOpen(c))}
              />
            ))}
          </ul>
          {groupFoot?.(g)}
        </section>
      ))}
      {footer}
    </div>
  );
  const header = (
    <header className="header">
      <h1 className="title">Budget</h1>
      <span className="month">October 2026</span>
      <div className="header-actions">{actions}</div>
    </header>
  );
  if (wide)
    return (
      <div className="a" data-wide="true">
        {header}
        <div className="a-columns">
          <aside className="a-summary">{summary(w)}</aside>
          <div className="a-table">{body}</div>
        </div>
      </div>
    );
  return (
    <div className="stack">
      {header}
      {summary(w)}
      {body}
    </div>
  );
}

/* ------------------------------ A. Edit mode ------------------------ */

function VariantA(props: Props) {
  const [edit, setEdit] = useUrlParameter("edit");
  const editing = edit === "on" && props.w.groups.length > 0;
  if (!editing)
    return (
      <BudgetView
        {...props}
        onAdded={() => setEdit("on", "push")}
        actions={
          props.w.groups.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEdit("on", "push")}
            >
              Edit
            </button>
          )
        }
      />
    );
  return <EditMode {...props} onDone={() => setEdit("off", "push")} />;
}

function EditMode({ w, wide, act, onDone }: Props & { onDone(): void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  // Crossing into another Group remounts the row, so the handle gets focus
  // back before the next key press can land on nothing.
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!refocus.current) return;
    document
      .querySelector<HTMLElement>(`[data-handle="${refocus.current}"]`)
      ?.focus();
    refocus.current = null;
  });
  const [menu, setMenu] = useState<{
    kind: "category" | "group";
    id: string;
  } | null>(null);

  function startDrag(
    e: ReactPointerEvent,
    kind: "category" | "group",
    id: string,
    name: string,
  ) {
    e.preventDefault();
    setDragging(id);
    const scroller = (e.target as HTMLElement).closest(
      ".bs-phone > :first-child",
    );
    const onMove = (ev: PointerEvent) => {
      const box = scroller?.getBoundingClientRect();
      if (scroller && box) {
        if (ev.clientY < box.top + 56) scroller.scrollTop -= 8;
        if (ev.clientY > box.bottom - 120) scroller.scrollTop += 8;
      }
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const groupEl = under?.closest<HTMLElement>("[data-group-id]");
      if (!groupEl) return;
      const groupId = groupEl.dataset.groupId ?? "";
      if (kind === "group") {
        if (groupId === id) return;
        const r = groupEl.getBoundingClientRect();
        act.set((old) => {
          const others = old.groups.filter((g) => g.id !== id);
          const at = others.findIndex((g) => g.id === groupId);
          return moveGroup(
            old,
            id,
            ev.clientY < r.top + r.height / 2 ? at : at + 1,
          );
        });
        return;
      }
      const rowEl = under?.closest<HTMLElement>("[data-row-id]");
      if (rowEl?.dataset.rowId === id) return;
      act.set((old) => {
        const g = old.groups.find((x) => x.id === groupId);
        if (!g) return old;
        const others = g.categories.filter((c) => c.id !== id);
        if (rowEl) {
          const r = rowEl.getBoundingClientRect();
          const at = others.findIndex((c) => c.id === rowEl.dataset.rowId);
          return moveCat(
            old,
            id,
            groupId,
            ev.clientY < r.top + r.height / 2 ? at : at + 1,
          );
        }
        if (under?.closest("[data-group-head]"))
          return moveCat(old, id, groupId, 0);
        if (g.categories.some((c) => c.id === id)) return old;
        return moveCat(old, id, groupId, others.length);
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragging(null);
      act.log(kind === "group" ? "moveCategoryGroup" : "moveCategory");
      act.say(`${name} placed`);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const handleKeys = (
    e: ReactKeyboardEvent,
    kind: "category" | "group",
    id: string,
    name: string,
  ) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const by = e.key === "ArrowUp" ? -1 : 1;
    const next =
      kind === "group" ? stepGroup(w, id, by) : stepCat(w, id, by, true);
    if (!next) return;
    refocus.current = id;
    act.set(() => next);
    act.log(kind === "group" ? "moveCategoryGroup" : "moveCategory");
    if (kind === "category") {
      const found = findCat(next, id);
      if (found)
        act.say(
          `${name}, ${found.g.categories.findIndex((c) => c.id === id) + 1} of ${found.g.categories.length} in ${found.g.name}`,
        );
    } else {
      act.say(
        `${name}, ${next.groups.findIndex((g) => g.id === id) + 1} of ${next.groups.length} Groups`,
      );
    }
  };

  const handle = (kind: "category" | "group", id: string, name: string) => (
    <button
      type="button"
      className="ct-handle"
      data-handle={id}
      aria-label={`Move ${name}. Use the up and down arrow keys.`}
      onPointerDown={(e) => startDrag(e, kind, id, name)}
      onKeyDown={(e) => handleKeys(e, kind, id, name)}
    >
      ⠿
    </button>
  );
  const menuButton = (kind: "category" | "group", id: string, name: string) => (
    <button
      type="button"
      className="ct-more"
      aria-label={`More for ${name}`}
      onClick={() => setMenu({ kind, id })}
    >
      ⋯
    </button>
  );
  const inlineName = (
    label: string,
    value: string,
    onSave: (name: string) => void,
    bold: boolean,
  ) => <InlineName label={label} value={value} onSave={onSave} bold={bold} />;
  const openCat = menu?.kind === "category" && findCat(w, menu.id);
  const openGroup =
    menu?.kind === "group" && w.groups.find((g) => g.id === menu.id);

  const list = (
    <div className="stack ct-edit-list">
      {w.groups.map((g) => (
        <section
          key={g.id}
          className="card ct-edit-group"
          data-group-id={g.id}
          data-dragging={dragging === g.id}
        >
          <div className="ct-edit-row ct-edit-head" data-group-head>
            {handle("group", g.id, g.name)}
            {inlineName(
              `Name of ${g.name}`,
              g.name,
              (name) => {
                act.set((old) => ({
                  ...old,
                  groups: old.groups.map((x) =>
                    x.id === g.id ? { ...x, name } : x,
                  ),
                }));
                act.log("renameCategoryGroup");
              },
              true,
            )}
            {menuButton("group", g.id, g.name)}
          </div>
          <ul>
            {g.categories.map((c) => (
              <li
                key={c.id}
                className="ct-edit-row"
                data-row-id={c.id}
                data-hidden={c.hidden}
                data-dragging={dragging === c.id}
              >
                {handle("category", c.id, c.name)}
                {inlineName(
                  `Name of ${c.name}`,
                  c.name,
                  (name) => {
                    act.set((old) => editCat(old, c.id, { name }));
                    act.log("renameCategory");
                  },
                  false,
                )}
                {c.hidden && <span className="ct-tag small">Hidden</span>}
                {left(c) !== 0 && (
                  <span
                    className="pill num small"
                    data-state={left(c) < 0 ? "overspent" : "funded"}
                  >
                    {fmt(left(c))}
                  </span>
                )}
                {menuButton("category", c.id, c.name)}
              </li>
            ))}
          </ul>
          <div className="ct-edit-foot">
            <InlineAdd
              label="Add a Category"
              onAdd={(name) => {
                const id = newId();
                act.set((old) => addCategoryTo(old, g.id, name, id));
                act.log("createCategory");
                act.say(`Added ${name}`);
              }}
            />
          </div>
        </section>
      ))}
      <InlineAdd
        label="Add a Category Group"
        onAdd={(name) => {
          act.set((old) => ({
            ...old,
            groups: [...old.groups, { id: newId(), name, categories: [] }],
          }));
          act.log("createCategoryGroup");
        }}
      />
    </div>
  );
  const bar = (
    <div className="ct-edit-bar">
      <h1 className="title ct-edit-title">Edit Categories</h1>
      <button type="button" className="btn btn-primary" onClick={onDone}>
        Done
      </button>
    </div>
  );
  const sheets = (
    <>
      {openCat && (
        <Sheet title={openCat.c.name} wide={wide} onClose={() => setMenu(null)}>
          <div className="stack">
            <CategorySteps
              c={openCat.c}
              g={openCat.g}
              w={w}
              act={act}
              withHidden
            />
            <GroupPicker c={openCat.c} g={openCat.g} w={w} act={act} />
            <CategoryFate
              c={openCat.c}
              w={w}
              act={act}
              onDone={() => setMenu(null)}
            />
          </div>
        </Sheet>
      )}
      {openGroup && (
        <Sheet title={openGroup.name} wide={wide} onClose={() => setMenu(null)}>
          <div className="stack">
            <GroupSteps g={openGroup} w={w} act={act} />
            <GroupFate
              g={openGroup}
              w={w}
              act={act}
              onDone={() => setMenu(null)}
            />
          </div>
        </Sheet>
      )}
    </>
  );
  if (wide)
    return (
      <div className="a" data-wide="true">
        {bar}
        <div className="a-columns">
          <aside className="a-summary">{summary(w)}</aside>
          {list}
        </div>
        {sheets}
      </div>
    );
  return (
    <div className="stack">
      {bar}
      {list}
      {sheets}
    </div>
  );
}

function InlineName({
  label,
  value,
  onSave,
  bold,
}: {
  label: string;
  value: string;
  onSave(name: string): void;
  bold: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="ct-name-input"
      data-bold={bold}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/* ------------------------------ B. Categories screen ---------------- */

function VariantB(props: Props) {
  const { w, wide, act } = props;
  const [view, setView] = useUrlParameter("view");
  const [selected, setSelected] = useState<string | null>(null);
  const [lifted, setLifted] = useState<{
    kind: "category" | "group";
    id: string;
  } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [adding, setAdding] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(true);

  if (view !== "manage")
    return (
      <BudgetView
        {...props}
        onAdded={() => setView("manage", "push")}
        actions={
          w.groups.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setView("manage", "push")}
            >
              Categories
            </button>
          )
        }
      />
    );

  const foundCat = selected ? findCat(w, selected) : undefined;
  const foundGroup = selected
    ? w.groups.find((g) => g.id === selected)
    : undefined;
  const hidden = hiddenOf(w);

  const status = (c: Category) =>
    left(c) !== 0 ? fmt(left(c)) : c.used ? "" : "Never used";
  const row = (c: Category) => (
    <li key={c.id}>
      <button
        type="button"
        className="ct-list-row"
        aria-current={selected === c.id ? "true" : undefined}
        onClick={() => {
          if (reordering) setLifted({ kind: "category", id: c.id });
          else setSelected(c.id);
        }}
      >
        <span className="tile ct-tile-small" aria-hidden>
          {c.name[0]}
        </span>
        <span className="ct-list-name">{c.name}</span>
        <span className="muted small num">{status(c)}</span>
        <span className="muted" aria-hidden>
          {reordering ? "⠿" : "›"}
        </span>
      </button>
    </li>
  );
  const listBody = lifted ? (
    <PlaceList
      w={w}
      lifted={lifted}
      onCancel={() => setLifted(null)}
      onPlace={(groupId, toIndex) => {
        act.set((old) =>
          lifted.kind === "group"
            ? moveGroup(old, lifted.id, toIndex)
            : moveCat(old, lifted.id, groupId, toIndex),
        );
        act.log(lifted.kind === "group" ? "moveCategoryGroup" : "moveCategory");
        setLifted(null);
      }}
    />
  ) : (
    <div className="stack">
      {reordering && (
        <p className="muted small">
          Tap what you want to move, then tap where it goes.
        </p>
      )}
      {w.groups.map((g) => (
        <section key={g.id}>
          <button
            type="button"
            className="ct-list-group"
            aria-current={selected === g.id ? "true" : undefined}
            onClick={() => {
              if (reordering) setLifted({ kind: "group", id: g.id });
              else setSelected(g.id);
            }}
          >
            <span>{g.name}</span>
            <span className="muted" aria-hidden>
              {reordering ? "⠿" : "›"}
            </span>
          </button>
          <ul className="card ct-list">
            {visible(g).map(row)}
            {visible(g).length === 0 && (
              <li className="muted small ct-list-empty">
                {g.categories.length === 0
                  ? "No Categories in this Group."
                  : "Only hidden Categories."}
              </li>
            )}
          </ul>
        </section>
      ))}
      {!reordering && hidden.length > 0 && (
        <section>
          <button
            type="button"
            className="ct-list-group"
            aria-expanded={hiddenOpen}
            onClick={() => setHiddenOpen(!hiddenOpen)}
          >
            <span>Hidden ({hidden.length})</span>
            <span className="muted" aria-hidden>
              {hiddenOpen ? "⌄" : "›"}
            </span>
          </button>
          {hiddenOpen && (
            <ul className="card ct-list">
              {hidden.map(({ c, g }) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="ct-list-row"
                    aria-current={selected === c.id ? "true" : undefined}
                    onClick={() => setSelected(c.id)}
                  >
                    <span className="tile ct-tile-small" aria-hidden>
                      {c.name[0]}
                    </span>
                    <span className="ct-list-name">
                      {c.name}
                      <span className="muted small"> in {g.name}</span>
                    </span>
                    {left(c) !== 0 && (
                      <span
                        className="pill num small"
                        data-state={left(c) < 0 ? "overspent" : "funded"}
                      >
                        {fmt(left(c))}
                      </span>
                    )}
                    <span className="muted" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!reordering && (
        <InlineAdd
          label="Add a Category Group"
          onAdd={(name) => {
            act.set((old) => ({
              ...old,
              groups: [...old.groups, { id: newId(), name, categories: [] }],
            }));
            act.log("createCategoryGroup");
          }}
        />
      )}
    </div>
  );
  const detail = foundCat ? (
    <div className="stack" key={foundCat.c.id}>
      <NameField
        label="Name"
        value={foundCat.c.name}
        onSave={(name) => {
          act.set((old) => editCat(old, foundCat.c.id, { name }));
          act.log("renameCategory");
        }}
      />
      <GroupPicker c={foundCat.c} g={foundCat.g} w={w} act={act} />
      {!foundCat.c.hidden && (
        <CategorySteps
          c={foundCat.c}
          g={foundCat.g}
          w={w}
          act={act}
          withHidden={false}
        />
      )}
      <dl className="card ct-facts">
        <div className="split">
          <dt className="muted">Available</dt>
          <dd className="num">{fmt(left(foundCat.c))}</dd>
        </div>
        <div className="split">
          <dt className="muted">Assigned in October</dt>
          <dd className="num">{fmt(foundCat.c.assigned)}</dd>
        </div>
      </dl>
      <CategoryFate
        c={foundCat.c}
        w={w}
        act={act}
        onDone={() => setSelected(null)}
      />
    </div>
  ) : foundGroup ? (
    <div className="stack" key={foundGroup.id}>
      <NameField
        label="Name"
        value={foundGroup.name}
        onSave={(name) => {
          act.set((old) => ({
            ...old,
            groups: old.groups.map((g) =>
              g.id === foundGroup.id ? { ...g, name } : g,
            ),
          }));
          act.log("renameCategoryGroup");
        }}
      />
      <GroupSteps g={foundGroup} w={w} act={act} />
      <GroupFate
        g={foundGroup}
        w={w}
        act={act}
        onDone={() => setSelected(null)}
      />
    </div>
  ) : (
    <p className="muted ct-pick">Pick a Category or Category Group to edit.</p>
  );
  const top = (
    <header className="ct-screen-head">
      <button
        type="button"
        className="link"
        onClick={() => {
          if (!wide && selected) setSelected(null);
          else setView("budget", "push");
        }}
      >
        ‹ {!wide && selected ? "Categories" : "Budget"}
      </button>
      <div className="split">
        <h1 className="title">
          {!wide && foundCat
            ? foundCat.c.name
            : !wide && foundGroup
              ? foundGroup.name
              : "Categories"}
        </h1>
        {(wide || !selected) && (
          <div className="row-gap">
            <button
              type="button"
              className="btn btn-secondary"
              aria-pressed={reordering}
              onClick={() => {
                setReordering(!reordering);
                setLifted(null);
                setSelected(null);
              }}
            >
              {reordering ? "Done" : "Reorder"}
            </button>
            {!reordering && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAdding(true)}
              >
                + Add
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
  const add = adding && (
    <AddSheet
      {...props}
      onClose={() => setAdding(false)}
      onAdded={setSelected}
    />
  );
  if (wide)
    return (
      <div>
        {top}
        <div className="ct-two-pane">
          <div>{listBody}</div>
          <aside className="card ct-detail">{detail}</aside>
        </div>
        {add}
      </div>
    );
  return (
    <div className="stack">
      {top}
      {selected ? detail : listBody}
      {add}
    </div>
  );
}

/* ------------------------------ C. In the Category sheet ------------ */

function VariantC(props: Props) {
  const { w, wide, act } = props;
  const [openCatId, setOpenCatId] = useState<string | null>(null);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{
    kind: "category" | "group";
    id: string;
  } | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const found = openCatId ? findCat(w, openCatId) : undefined;
  const group = openGroupId
    ? w.groups.find((g) => g.id === openGroupId)
    : undefined;
  const hidden = hiddenOf(w);
  const close = () => {
    setOpenCatId(null);
    setOpenGroupId(null);
    setPlacing(null);
  };
  const place = placing && (
    <PlaceList
      w={w}
      lifted={placing}
      onCancel={() => setPlacing(null)}
      onPlace={(groupId, toIndex) => {
        act.set((old) =>
          placing.kind === "group"
            ? moveGroup(old, placing.id, toIndex)
            : moveCat(old, placing.id, groupId, toIndex),
        );
        act.log(
          placing.kind === "group" ? "moveCategoryGroup" : "moveCategory",
        );
        setPlacing(null);
      }}
    />
  );

  return (
    <>
      <BudgetView
        {...props}
        showEmptyGroups
        onAdded={setOpenCatId}
        onOpen={(c) => setOpenCatId(c.id)}
        groupHead={(g) => (
          <button
            type="button"
            className="ct-group-button"
            onClick={() => setOpenGroupId(g.id)}
          >
            <h2>{g.name}</h2>
            <span className="muted" aria-hidden>
              ⋯
            </span>
          </button>
        )}
        groupFoot={(g) => (
          <div className="ct-group-foot">
            {visible(g).length === 0 && g.categories.length > 0 && (
              <p className="muted small">
                Only hidden Categories:{" "}
                {g.categories.map((c) => c.name).join(", ")}.
              </p>
            )}
            <InlineAdd
              label="Add a Category"
              onAdd={(name) => {
                const id = newId();
                act.set((old) => addCategoryTo(old, g.id, name, id));
                act.log("createCategory");
                setOpenCatId(id);
              }}
            />
          </div>
        )}
        footer={
          w.groups.length > 0 && (
            <div className="stack ct-budget-foot">
              <InlineAdd
                label="Add a Category Group"
                onAdd={(name) => {
                  act.set((old) => ({
                    ...old,
                    groups: [
                      ...old.groups,
                      { id: newId(), name, categories: [] },
                    ],
                  }));
                  act.log("createCategoryGroup");
                }}
              />
              {hidden.length > 0 && (
                <button
                  type="button"
                  className="link ct-add"
                  aria-expanded={hiddenOpen}
                  onClick={() => setHiddenOpen(!hiddenOpen)}
                >
                  {hidden.length} hidden{" "}
                  {hidden.length === 1 ? "Category" : "Categories"}
                </button>
              )}
              {hiddenOpen && (
                <ul className="card ct-list">
                  {hidden.map(({ c, g }) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="ct-list-row"
                        onClick={() => setOpenCatId(c.id)}
                      >
                        <span className="tile ct-tile-small" aria-hidden>
                          {c.name[0]}
                        </span>
                        <span className="ct-list-name">
                          {c.name}
                          <span className="muted small"> in {g.name}</span>
                        </span>
                        {left(c) !== 0 && (
                          <span
                            className="pill num small"
                            data-state={left(c) < 0 ? "overspent" : "funded"}
                          >
                            {fmt(left(c))}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        }
      />
      {found && (
        <Sheet title={found.c.name} wide={wide} onClose={close}>
          {place ?? (
            <div className="stack">
              <dl className="card ct-facts">
                <div className="split">
                  <dt className="muted">Carried forward</dt>
                  <dd className="num">{fmt(found.c.carried)}</dd>
                </div>
                <div className="split">
                  <dt className="muted">Spending</dt>
                  <dd className="num">− {fmt(found.c.spent)}</dd>
                </div>
                <div className="split">
                  <dt>
                    <b>Available</b>
                  </dt>
                  <dd className="num">
                    <b>{fmt(left(found.c))}</b>
                  </dd>
                </div>
              </dl>
              {!found.c.hidden && (
                <label className="fr-field">
                  <span className="muted small">Assigned in October</span>
                  <input
                    className="num"
                    inputMode="decimal"
                    defaultValue={found.c.assigned.toFixed(2)}
                    key={found.c.id}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isNaN(n) || n === found.c.assigned) return;
                      act.set((old) => ({
                        ...editCat(old, found.c.id, {
                          assigned: n,
                          used: true,
                        }),
                        readyToAssign: old.readyToAssign + found.c.assigned - n,
                      }));
                      act.log("setAssignment");
                    }}
                  />
                </label>
              )}
              <h3 className="ct-manage-head">Manage</h3>
              <NameField
                label="Name"
                value={found.c.name}
                onSave={(name) => {
                  act.set((old) => editCat(old, found.c.id, { name }));
                  act.log("renameCategory");
                }}
              />
              {!found.c.hidden && (
                <div className="ct-steps">
                  <span className="muted small">
                    {visible(found.g).findIndex((c) => c.id === found.c.id) + 1}{" "}
                    of {visible(found.g).length} in {found.g.name}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      setPlacing({ kind: "category", id: found.c.id })
                    }
                  >
                    Move…
                  </button>
                </div>
              )}
              <CategoryFate c={found.c} w={w} act={act} onDone={close} />
            </div>
          )}
        </Sheet>
      )}
      {group && (
        <Sheet title={group.name} wide={wide} onClose={close}>
          {place ?? (
            <div className="stack">
              <NameField
                label="Name"
                value={group.name}
                onSave={(name) => {
                  act.set((old) => ({
                    ...old,
                    groups: old.groups.map((g) =>
                      g.id === group.id ? { ...g, name } : g,
                    ),
                  }));
                  act.log("renameCategoryGroup");
                }}
              />
              <div className="ct-steps">
                <span className="muted small">
                  {w.groups.findIndex((g) => g.id === group.id) + 1} of{" "}
                  {w.groups.length} Groups
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPlacing({ kind: "group", id: group.id })}
                >
                  Move…
                </button>
              </div>
              <GroupFate g={group} w={w} act={act} onDone={close} />
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
