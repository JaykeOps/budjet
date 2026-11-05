import { type KeyboardEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  type Currency,
  type Money,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import type { Month } from "../../kernel/month";

const fieldId = (categoryId: string) => `assigned-${categoryId}`;

function focusField(categoryId: string) {
  document.getElementById(fieldId(categoryId))?.focus();
}

/**
 * Typing into the Assigned column, and the panel that follows the focused row:
 * the row is remembered once focus leaves, so the panel can be used. `onAssign`
 * returns false when the Assignment was refused.
 */
export function useAssignedColumn({
  ids,
  month,
  currency,
  onAssign,
  onError,
}: {
  /** Every Category in the column, in Budget order. */
  ids: string[];
  month: Month;
  currency: Currency;
  onAssign: (categoryId: string, amount: Money) => boolean;
  onError: (message: string | undefined) => void;
}) {
  const [row, setRow] = useState<{
    id: string;
    month: Month;
    draft?: string;
  }>();
  const [panelShown, setPanelShown] = useState(true);
  const panel = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  // A new Month, say from the browser's Back, starts afresh and drops a draft.
  const focused = row?.month === month ? row : undefined;
  const draftOf = (id: string) =>
    focused?.id === id ? focused.draft : undefined;

  /** A blank field reads as $0.00, as in the Category sheet. */
  const read = (draft: string) =>
    draft.trim() === "" ? money(0, currency) : parseMoney(draft, currency);

  /**
   * Drops the draft before anything else happens, so the blur from moving focus
   * finds nothing left to save.
   */
  function dropDraft(id: string) {
    flushSync(() => setRow({ id, month }));
  }

  /** Saves what's typed; false when it can't be read, so the row stays. */
  function save(id: string, assigned: Money): boolean {
    const draft = draftOf(id);
    if (draft === undefined) return true;
    const amount = read(draft);
    if (!amount) {
      onError(`"${draft}" isn't an amount in ${currency}`);
      return false;
    }
    dropDraft(id);
    onError(undefined);
    return amount.minorUnits === assigned.minorUnits || onAssign(id, amount);
  }

  function neighbour(id: string, by: number): string | undefined {
    return ids[ids.indexOf(id) + by];
  }

  return {
    focusedId: focused?.id,
    typed: focused?.draft === undefined ? undefined : read(focused.draft),
    panelShown,
    panel,
    toggle,

    field: (id: string, assigned: Money) => ({
      id: fieldId(id),
      value: draftOf(id) ?? typedMoney(assigned),
      onChange: (event: { target: { value: string } }) =>
        setRow({ id, month, draft: event.target.value }),
      onFocus: (event: { target: HTMLInputElement }) => {
        event.target.select();
        if (focused?.id !== id) setRow({ id, month });
      },
      onBlur: () => {
        save(id, assigned);
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
          dropDraft(id);
          onError(undefined);
          event.currentTarget.select();
          return;
        }
        const by =
          event.key === "Enter" || event.key === "ArrowDown"
            ? 1
            : event.key === "ArrowUp"
              ? -1
              : 0;
        if (by === 0) return;
        event.preventDefault();
        if (!save(id, assigned)) return;
        const next = neighbour(id, by);
        if (next) focusField(next);
      },
    }),

    cover: (id: string) => {
      const field = document.getElementById(fieldId(id));
      field?.scrollIntoView({ block: "center" });
      field?.focus();
    },

    /** A suggestion replaces what's typed, saves and moves on. */
    pick: (id: string, amount: Money) => {
      dropDraft(id);
      onError(undefined);
      if (!onAssign(id, amount)) {
        focusField(id);
        return;
      }
      focusField(neighbour(id, 1) ?? id);
    },

    goToPanel: () => {
      const within = panel.current;
      const first =
        within?.querySelector<HTMLElement>("[data-suggestion]") ??
        within?.querySelector<HTMLElement>("button");
      first?.focus();
    },

    backToRow: () => {
      if (focused) focusField(focused.id);
    },

    /** Keeps focus on the one button that hides or shows the panel. */
    togglePanel: () => {
      flushSync(() => setPanelShown((shown) => !shown));
      toggle.current?.focus();
    },
  };
}

export type AssignedColumn = ReturnType<typeof useAssignedColumn>;
