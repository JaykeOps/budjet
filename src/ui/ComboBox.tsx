import { type ReactNode, type Ref, useContext, useEffect, useRef } from "react";
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
      <Input
        ref={inputRef}
        className={styles.input}
        placeholder={placeholder}
        onKeyDownCapture={(event) => {
          tabbing.current = event.key === "Tab";
        }}
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

/** Narrowing leaves the best match ready, so typing a few letters and Enter chooses it. */
function FirstOptionReady() {
  const state = useContext(ComboBoxStateContext);
  const typed = state?.inputValue;
  // biome-ignore lint/correctness/useExhaustiveDependencies: what's typed is what it runs on.
  useEffect(() => {
    if (!state?.isFocused || !state.isOpen || !typed) return;
    if (typed === state.selectedItem?.textValue) return;
    // After the state's own effect, which clears this whenever typing changes.
    queueMicrotask(() =>
      state.selectionManager.setFocusedKey(state.collection.getFirstKey()),
    );
  }, [typed]);
  return null;
}
