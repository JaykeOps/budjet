import {
  type ReactNode,
  type Ref,
  type RefObject,
  useContext,
  useEffect,
  useRef,
} from "react";
import {
  ComboBox as AriaComboBox,
  ComboBoxStateContext,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";
import styles from "./ComboBox.module.css";

// [DEBUG-a4f2] temporary timeline
function dbg(kind: string, data: Record<string, unknown> = {}) {
  const w = window as unknown as { __diag?: string[] };
  w.__diag ??= [];
  const active = document.activeElement as HTMLElement | null;
  w.__diag.push(
    `${performance.now().toFixed(1)} ${kind} ${JSON.stringify(data)} active=${active?.getAttribute?.("aria-label") ?? active?.getAttribute?.("placeholder") ?? active?.tagName}`,
  );
}
function snap(state: {
  inputValue: string;
  isOpen: boolean;
  isFocused: boolean;
  selectedKey: unknown;
  collection: { size: number; getFirstKey(): unknown; getItem(k: never): unknown };
  selectionManager: { focusedKey: unknown; isFocused: boolean };
}) {
  const fk = state.selectionManager.focusedKey;
  return {
    input: state.inputValue,
    fk,
    fkIn: fk == null ? null : !!state.collection.getItem(fk as never),
    open: state.isOpen,
    focused: state.isFocused,
    sel: state.selectedKey,
    size: state.collection.size,
    first: state.collection.getFirstKey(),
  };
}
if (typeof window !== "undefined") {
  for (const type of ["focusin", "focusout", "input", "keydown", "submit"]) {
    document.addEventListener(
      type,
      (e) => {
        const t = e.target as HTMLElement & { value?: string };
        dbg(`dom:${type}`, {
          target: t.getAttribute?.("placeholder") ?? t.getAttribute?.("aria-label") ?? t.tagName,
          value: t.value,
          key: (e as KeyboardEvent).key,
        });
      },
      true,
    );
  }
}

export type ComboBoxOption = {
  id: string;
  /** What typing matches, and what the field reads once it's chosen. */
  name: string;
  /** How it shows in the list, if it's more than its name. */
  content?: ReactNode;
};

/**
 * A text field offering a list, for when a native select can't narrow as you
 * type or show more than a name. Arrows and Enter choose, Esc closes the list.
 *
 * With `selectedId` it chooses one of its options, offers them all on focus and
 * narrows to what's typed, with the first one ready for Enter or Tab. With
 * `value` it keeps whatever's typed, and its options are only suggestions.
 */
export function ComboBox({
  label,
  options,
  placeholder,
  inputRef,
  selectedId = null,
  value,
  onValue,
  onSelect,
  onPicked,
}: {
  label: string;
  options: readonly ComboBoxOption[];
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  selectedId?: string | null;
  value?: string;
  onValue?: (value: string) => void;
  onSelect: (id: string | null) => void;
  /** An option was chosen by Enter or the pointer. Tab moves on by itself. */
  onPicked?: () => void;
}) {
  const tabbing = useRef(false);
  const free = value !== undefined;
  return (
    <AriaComboBox
      className={styles.field}
      selectedKey={selectedId}
      onSelectionChange={(key) => {
        dbg("onSelectionChange", { key, tabbing: tabbing.current, label });
        onSelect(key === null ? null : String(key));
        if (key !== null && !tabbing.current) onPicked?.();
      }}
      {...(free
        ? {
            allowsCustomValue: true,
            menuTrigger: "input" as const,
            items: options,
            inputValue: value,
            onInputChange: onValue,
          }
        : { menuTrigger: "focus" as const, defaultItems: options })}
    >
      <Label className={styles.label}>{label}</Label>
      <ComboBoxInput
        inputRef={inputRef}
        placeholder={placeholder}
        options={free ? undefined : options}
        tabbing={tabbing}
      />
      <Popover className={styles.popover} placement="bottom start">
        {!free && <FirstOptionReady />}
        <ListBox className={styles.list} aria-label={label}>
          {(option: ComboBoxOption) => (
            <ListBoxItem
              id={option.id}
              textValue={option.name}
              className={styles.option}
            >
              {option.content ?? option.name}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}

/**
 * With no option highlighted, Enter would keep the field's old choice, whatever's
 * typed: submitting the form if the list is closed, and putting the old choice
 * back if it's open. When what's typed isn't that choice, Enter chooses the first
 * match, or stays here if nothing matches.
 */
function ComboBoxInput({
  inputRef,
  placeholder,
  options,
  tabbing,
}: {
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  /** What it chooses from, unless it keeps whatever's typed. */
  options?: readonly ComboBoxOption[];
  tabbing: RefObject<boolean>;
}) {
  const state = useContext(ComboBoxStateContext);
  if (options && state) dbg("render", snap(state as never));
  return (
    <Input
      ref={inputRef}
      className={styles.input}
      placeholder={placeholder}
      onKeyDownCapture={(event) => {
        tabbing.current = event.key === "Tab";
        if (options && state && event.key === "Enter")
          dbg("ENTER", { ...snap(state as never), live: state.selectionManager.focusedKey });
        if (event.key !== "Enter" || !options || !state) return;
        if (state.isOpen && state.selectionManager.focusedKey !== null) return;
        const typed = state.inputValue.trim().toLowerCase();
        const chosen = state.selectedItem?.textValue ?? "";
        if (!typed || typed === chosen.toLowerCase()) return;
        event.preventDefault();
        event.stopPropagation();
        const match = options.find(({ name }) =>
          name.toLowerCase().includes(typed),
        );
        if (match) state.setSelectedKey(match.id);
      }}
    />
  );
}

/** Narrowing leaves the best match ready, so typing a few letters and Enter chooses it. */
function FirstOptionReady() {
  const state = useContext(ComboBoxStateContext);
  const typed = state?.inputValue;
  // biome-ignore lint/correctness/useExhaustiveDependencies: what's typed is what it runs on.
  useEffect(() => {
    if (state) dbg("FOR effect", snap(state as never));
    if (!state?.isFocused || !state.isOpen || !typed) return;
    if (typed === state.selectedItem?.textValue) return;
    // After the state's own effect, which clears this whenever typing changes.
    queueMicrotask(() => {
      dbg("FOR microtask", { before: state.selectionManager.focusedKey, sets: state.collection.getFirstKey(), ...snap(state as never) });
      state.selectionManager.setFocusedKey(state.collection.getFirstKey());
    });
  }, [typed]);
  return null;
}
