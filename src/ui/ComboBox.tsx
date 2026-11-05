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
  useFilter,
} from "react-aria-components";
import styles from "./ComboBox.module.css";

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
 * narrows to what's typed, with the best match ready for Enter or Tab. With
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
  const { contains } = useFilter({ sensitivity: "base" });
  return (
    <AriaComboBox
      className={styles.field}
      selectedKey={selectedId}
      onSelectionChange={(key) => {
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
        : {
            menuTrigger: "focus" as const,
            defaultItems: options,
            // Matches what Enter goes by, so a stray space narrows the same way.
            defaultFilter: (name: string, typed: string) =>
              contains(name, typed.trim()),
            defaultInputValue:
              options.find(({ id }) => id === selectedId)?.name ?? "",
          })}
    >
      <Label className={styles.label}>{label}</Label>
      <ComboBoxInput
        inputRef={inputRef}
        placeholder={placeholder}
        options={free ? undefined : options}
        tabbing={tabbing}
      />
      <Popover className={styles.popover} placement="bottom start">
        {!free && <FirstOptionReady options={options} />}
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
 * back if it's open. When what's typed isn't that choice, Enter chooses the best
 * match, or stays here if nothing matches. When it is that choice, an open list
 * closes and Enter still reaches the form.
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
  const firstMatch = useFirstMatch(options ?? []);
  return (
    <Input
      ref={inputRef}
      className={styles.input}
      placeholder={placeholder}
      onKeyDownCapture={(event) => {
        tabbing.current = event.key === "Tab";
        if (event.key !== "Enter" || !options || !state) return;
        const { focusedKey } = state.selectionManager;
        const elsewhere =
          focusedKey !== null && focusedKey !== state.selectedKey;
        if (state.isOpen && elsewhere) return;
        const typed = state.inputValue.trim().toLowerCase();
        const chosen = state.selectedItem?.textValue ?? "";
        if (!typed) return;
        event.preventDefault();
        if (typed === chosen.toLowerCase()) {
          // The list has nothing new to say, so this Enter is for the form.
          if (!state.isOpen) return;
          event.stopPropagation();
          state.close();
          event.currentTarget.form?.requestSubmit();
          return;
        }
        event.stopPropagation();
        const match = firstMatch(typed);
        if (match) state.setSelectedKey(match.id);
      }}
    />
  );
}

const sameName = new Intl.Collator(undefined, { sensitivity: "base" });

/**
 * What Enter chooses and the list highlights, going by the list's own matching:
 * the option with exactly that name, wherever it's listed, or else the first left.
 */
function useFirstMatch(options: readonly ComboBoxOption[]) {
  const { contains } = useFilter({ sensitivity: "base" });
  return (typed: string) => {
    const wanted = typed.trim();
    return (
      options.find(({ name }) => sameName.compare(name, wanted) === 0) ??
      options.find(({ name }) => contains(name, wanted))
    );
  };
}

/** Narrowing leaves the best match ready, so typing a few letters and Enter chooses it. */
function FirstOptionReady({ options }: { options: readonly ComboBoxOption[] }) {
  const state = useContext(ComboBoxStateContext);
  const typed = state?.inputValue;
  const firstMatch = useFirstMatch(options);
  // biome-ignore lint/correctness/useExhaustiveDependencies: what's typed is what it runs on.
  useEffect(() => {
    if (!state?.isFocused || !state.isOpen || !typed) return;
    if (typed === state.selectedItem?.textValue) return;
    // Not the state's collection: it hasn't narrowed yet, and Enter would choose its first option.
    const first = firstMatch(typed)?.id ?? null;
    // After the state's own effect, which clears this whenever typing changes.
    queueMicrotask(() => state.selectionManager.setFocusedKey(first));
  }, [typed]);
  return null;
}
