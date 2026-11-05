import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./CategoryEditor.module.css";
import type { Category, CategoryGroup } from "./queries";
import {
  type CategoryPlace,
  categoryAt,
  categoryPlace,
  categoryStep,
  groupPlace,
  groupStep,
  withCategoryAt,
  withGroupAt,
} from "./reorder";

type Named = { id: string; name: string };

export type Moves = {
  moveCategory: (category: Named, to: CategoryPlace) => void;
  moveGroup: (group: Named, toIndex: number) => void;
};

type Kind = "category" | "group";

/** How near the viewport's edges a drag scrolls. The bottom clears the tab bar. */
const SCROLL_ZONE = { top: 56, bottom: 120 };
const SCROLL_PER_FRAME = 8;

/**
 * Dragging and arrow keys for the handles of `list`. What a drag shows stays on
 * screen only until it's dropped, so the Change Log gets one move per drag.
 */
export function useReorder(
  groups: CategoryGroup[],
  moves: Moves,
  list: RefObject<HTMLElement | null>,
) {
  const [shown, setShown] = useState<CategoryGroup[]>();
  const [dragging, setDragging] = useState<string>();

  // A move can remount the row, so its handle gets focus back straight after.
  const refocus = useRef<string>(undefined);
  useLayoutEffect(() => {
    if (!refocus.current) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-handle="${refocus.current}"]`)
      ?.focus();
    refocus.current = undefined;
  });

  function drop(kind: Kind, thing: Named, ended: CategoryGroup[]) {
    if (kind === "group") {
      const from = groups.findIndex(({ id }) => id === thing.id);
      const to = ended.findIndex(({ id }) => id === thing.id);
      if (from !== to) moves.moveGroup(thing, to);
      return;
    }
    const from = categoryAt(groups, thing.id);
    const to = categoryAt(ended, thing.id);
    if (to && (from?.groupId !== to.groupId || from.toIndex !== to.toIndex)) {
      moves.moveCategory(thing, { groupId: to.groupId, toIndex: to.toIndex });
    }
  }

  function startDrag(event: PointerEvent, kind: Kind, thing: Named) {
    if (event.button !== 0) return;
    // On the list, because a row remounts on crossing Category Groups, which
    // would end a touch held by the handle.
    list.current?.setPointerCapture(event.pointerId);
    setDragging(thing.id);
    let current = groups;
    let x = event.clientX;
    let y = event.clientY;

    const place = () => {
      const next = rearranged(current, kind, thing.id, x, y);
      if (next === current) return;
      current = next;
      setShown(next);
    };
    let frame = requestAnimationFrame(function tick() {
      if (y < SCROLL_ZONE.top) window.scrollBy(0, -SCROLL_PER_FRAME);
      if (y > window.innerHeight - SCROLL_ZONE.bottom) {
        window.scrollBy(0, SCROLL_PER_FRAME);
      }
      place();
      frame = requestAnimationFrame(tick);
    });

    const onMove = (moved: globalThis.PointerEvent) => {
      x = moved.clientX;
      y = moved.clientY;
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", stop);
      cancelAnimationFrame(frame);
      setShown(undefined);
      setDragging(undefined);
    };
    const onUp = (ended: globalThis.PointerEvent) => {
      onMove(ended);
      place();
      stop();
      refocus.current = thing.id;
      drop(kind, thing, current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", stop);
  }

  function onKeyDown(event: KeyboardEvent, kind: Kind, thing: Named) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const by = event.key === "ArrowUp" ? -1 : 1;
    if (kind === "group") {
      const toIndex = groupStep(groups, thing.id, by);
      if (toIndex === undefined) return;
      refocus.current = thing.id;
      moves.moveGroup(thing, toIndex);
      return;
    }
    const to = categoryStep(groups, thing.id, by);
    if (!to) return;
    refocus.current = thing.id;
    moves.moveCategory(thing, to);
  }

  return {
    /** The list as it should look now: mid-drag, as the drag has left it. */
    shown: shown ?? groups,
    dragging,
    handle: (kind: Kind, thing: Named) => (
      <button
        type="button"
        className={styles.handle}
        data-handle={thing.id}
        aria-label={`Move ${thing.name}. Use the up and down arrow keys.`}
        onPointerDown={(event) => startDrag(event, kind, thing)}
        onKeyDown={(event) => onKeyDown(event, kind, thing)}
      >
        ⠿
      </button>
    ),
  };
}

/** The list with the dragged thing where the pointer now says, or `current` if that's where it is. */
function rearranged(
  current: CategoryGroup[],
  kind: Kind,
  id: string,
  x: number,
  y: number,
): CategoryGroup[] {
  const under = document.elementFromPoint(x, y);
  const groupElement = under?.closest<HTMLElement>("[data-group-id]");
  const groupId = groupElement?.dataset.groupId;
  if (!under || !groupElement || !groupId) return current;
  const before = (element: Element) => {
    const { top, height } = element.getBoundingClientRect();
    return y < top + height / 2;
  };

  if (kind === "group") {
    if (groupId === id) return current;
    const others = current.filter((group) => group.id !== id);
    const over = others.findIndex((group) => group.id === groupId);
    const toIndex = before(groupElement) ? over : over + 1;
    return current.findIndex((group) => group.id === id) === toIndex
      ? current
      : withGroupAt(current, id, toIndex);
  }

  const row = under.closest<HTMLElement>("[data-row-id]");
  if (row?.dataset.rowId === id) return current;
  const here = categoryAt(current, id);
  const others = current
    .find((group) => group.id === groupId)
    ?.categories.filter((category) => category.id !== id);
  if (!others || !here) return current;
  let toIndex: number;
  if (row) {
    const over = others.findIndex(({ id }) => id === row.dataset.rowId);
    toIndex = before(row) ? over : over + 1;
  } else if (under.closest("[data-group-head]")) {
    toIndex = 0;
  } else if (here.groupId === groupId) {
    return current;
  } else {
    toIndex = others.length;
  }
  return here.groupId === groupId && here.toIndex === toIndex
    ? current
    : withCategoryAt(current, id, { groupId, toIndex });
}

/** ⋯'s reordering for a Category: no dragging needed, as WCAG 2.5.7 asks. */
export function CategoryMoves({
  category,
  groups,
  moves,
}: {
  category: Category;
  groups: CategoryGroup[];
  moves: Moves;
}) {
  const step = (by: -1 | 1) => {
    const to = categoryStep(groups, category.id, by);
    return to && (() => moves.moveCategory(category, to));
  };
  const here = categoryAt(groups, category.id);
  return (
    <div className={styles.moves}>
      <Steps
        where={categoryPlace(groups, category.id)}
        onUp={step(-1)}
        onDown={step(1)}
      />
      <label className={styles.picker}>
        <span>Category Group</span>
        <select
          value={here?.groupId}
          onChange={(event) => {
            const to = groups.find(({ id }) => id === event.target.value);
            if (!to) return;
            moves.moveCategory(category, {
              groupId: to.id,
              toIndex: to.categories.length,
            });
          }}
        >
          {groups.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** ⋯'s reordering for a Category Group. */
export function GroupMoves({
  group,
  groups,
  moves,
}: {
  group: CategoryGroup;
  groups: CategoryGroup[];
  moves: Moves;
}) {
  const step = (by: -1 | 1) => {
    const toIndex = groupStep(groups, group.id, by);
    return toIndex === undefined
      ? undefined
      : () => moves.moveGroup(group, toIndex);
  };
  return (
    <div className={styles.moves}>
      <Steps
        where={groupPlace(groups, group.id)}
        onUp={step(-1)}
        onDown={step(1)}
      />
    </div>
  );
}

function Steps({
  where,
  onUp,
  onDown,
}: {
  where: string;
  onUp: (() => void) | undefined;
  onDown: (() => void) | undefined;
}) {
  return (
    <div className={styles.steps}>
      {/* Spoken here, because an open sheet hides the toast from assistive technology. */}
      <span role="status" className={styles.where}>
        {where}
      </span>
      <Step arrow="↑" label="Up" onPress={onUp} />
      <Step arrow="↓" label="Down" onPress={onDown} />
    </div>
  );
}

/** At an end it's only marked disabled, so focus stays on it rather than falling out of the sheet. */
function Step({
  arrow,
  label,
  onPress,
}: {
  arrow: string;
  label: string;
  onPress: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      className={styles.step}
      aria-disabled={!onPress}
      onClick={onPress}
    >
      <span aria-hidden="true">{arrow}</span> {label}
    </button>
  );
}
