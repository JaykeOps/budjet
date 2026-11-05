import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import { formatMoney } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { OpenableSheet } from "../../ui/Sheet";
import { categoryUsed, useAvailable } from "../budget-totals";
import styles from "./CategoryEditor.module.css";
import { type Category, type CategoryGroup, categoryGroups } from "./queries";

type Named = { id: string; name: string };

/** What the app shell does for each change. Any of them may refuse by throwing. */
export type CategoryChanges = {
  addCategory: (groupId: string, name: string) => void;
  addGroup: (name: string) => void;
  renameCategory: (categoryId: string, name: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  hide: (category: Named) => void;
  unhide: (category: Named) => void;
  deleteCategory: (category: Named) => void;
  deleteGroup: (group: Named) => void;
  moveThemAndDelete: (group: Named, toGroupId: string) => void;
  setLeftOut: (group: Named, leftOut: boolean) => void;
};

type Open = { kind: "category" | "group"; id: string };

/**
 * The Budget as an editable list: every Category Group and its Categories,
 * hidden ones dimmed in place, to add, rename and delete, with each one's ⋯
 * holding the rest.
 */
export function CategoryEditor({
  month,
  changes,
}: {
  /** The Month its Available pills are for. */
  month: Month;
  changes: CategoryChanges;
}) {
  const groups = useChangeLogQuery(categoryGroups);
  const [open, setOpen] = useState<Open>();
  const [deletions, setDeletions] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // What opened the sheet is gone, so focus would otherwise fall out of the
  // page. This runs after the sheet has handed focus back.
  useEffect(() => {
    if (deletions === 0) return;
    const frame = requestAnimationFrame(() => list.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [deletions]);

  const close = () => setOpen(undefined);
  const closeDeleted = () => {
    close();
    setDeletions((count) => count + 1);
  };

  const openGroup =
    open?.kind === "group" && groups.find(({ id }) => id === open.id);
  const openCategory =
    open?.kind === "category" &&
    groups
      .flatMap(({ categories }) => categories)
      .find(({ id }) => id === open.id);

  return (
    <div ref={list} tabIndex={-1} className={styles.list}>
      {groups.map((group) => (
        <section
          key={group.id}
          className={styles.group}
          aria-label={group.name}
        >
          <div className={`${styles.row} ${styles.head}`}>
            <NameField
              label={`Name of ${group.name}`}
              name={group.name}
              bold
              onRename={(name) => changes.renameGroup(group.id, name)}
            />
            <MoreButton
              name={group.name}
              onPress={() => setOpen({ kind: "group", id: group.id })}
            />
          </div>
          <ul className={styles.categories}>
            {group.categories.map((category) => (
              <li
                key={category.id}
                className={styles.row}
                data-hidden={category.hidden}
              >
                <NameField
                  label={`Name of ${category.name}`}
                  name={category.name}
                  onRename={(name) => changes.renameCategory(category.id, name)}
                />
                {category.hidden && <span className={styles.tag}>Hidden</span>}
                <AvailablePill categoryId={category.id} month={month} />
                <MoreButton
                  name={category.name}
                  onPress={() => setOpen({ kind: "category", id: category.id })}
                />
              </li>
            ))}
          </ul>
          <div className={styles.foot}>
            <InlineAdd
              label={`Add a Category to ${group.name}`}
              text="Add a Category"
              onAdd={(name) => changes.addCategory(group.id, name)}
            />
          </div>
        </section>
      ))}
      <InlineAdd
        label="Add a Category Group"
        text="Add a Category Group"
        onAdd={changes.addGroup}
      />
      {openCategory && (
        <OpenableSheet title={openCategory.name} isOpen onClose={close}>
          {() => (
            <CategoryFate
              category={openCategory}
              changes={changes}
              onClose={close}
              onDeleted={closeDeleted}
            />
          )}
        </OpenableSheet>
      )}
      {openGroup && (
        <OpenableSheet title={openGroup.name} isOpen onClose={close}>
          {() => (
            <GroupFate
              group={openGroup}
              others={groups.filter(({ id }) => id !== openGroup.id)}
              changes={changes}
              onClose={close}
              onDeleted={closeDeleted}
            />
          )}
        </OpenableSheet>
      )}
    </div>
  );
}

function MoreButton({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className={styles.more}
      aria-label={`More for ${name}`}
      onClick={onPress}
    >
      ⋯
    </button>
  );
}

function AvailablePill({
  categoryId,
  month,
}: {
  categoryId: string;
  month: Month;
}) {
  const amount = useAvailable(categoryId, month);
  if (!amount || amount.minorUnits === 0) return null;
  return (
    <span
      className={styles.pill}
      data-state={amount.minorUnits < 0 ? "overspent" : "funded"}
    >
      {formatMoney(amount)}
    </span>
  );
}

/** Saves a changed name on Enter or on leaving. A blank one goes back to what it was. */
function NameField({
  label,
  name,
  bold = false,
  onRename,
}: {
  label: string;
  name: string;
  bold?: boolean;
  onRename: (name: string) => void;
}) {
  // Only while typing, so a rename from another device still shows.
  const [draft, setDraft] = useState<string>();

  function finish() {
    const typed = draft?.trim();
    setDraft(undefined);
    if (typed && typed !== name) onRename(typed);
  }

  return (
    <input
      className={styles.name}
      data-bold={bold}
      aria-label={label}
      value={draft ?? name}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish();
      }}
    />
  );
}

/**
 * A button that opens a field for adding. Enter adds and stays open for the
 * next one; leaving adds what's typed and closes it.
 */
function InlineAdd({
  label,
  text,
  onAdd,
}: {
  label: string;
  text: string;
  onAdd: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const focusOnOpen = useCallback((field: HTMLInputElement | null) => {
    field?.focus();
  }, []);

  function add() {
    const typed = name.trim();
    setName("");
    if (typed) onAdd(typed);
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.add}
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        + {text}
      </button>
    );
  }
  return (
    <input
      ref={focusOnOpen}
      className={styles.addField}
      aria-label={label}
      placeholder={text}
      enterKeyHint="enter"
      value={name}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => {
        add();
        setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") add();
      }}
    />
  );
}

/** Runs a change that may be refused, showing why inside the sheet. */
function useAttempt(): [string | undefined, (change: () => void) => void] {
  const [refusal, setRefusal] = useState<string>();
  return [
    refusal,
    (change) => {
      try {
        change();
      } catch (failure) {
        setRefusal(
          failure instanceof Error ? failure.message : String(failure),
        );
      }
    },
  ];
}

function Fate({
  refusal,
  children,
}: {
  refusal: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={styles.fate}>
      {refusal && <p role="alert">{refusal}</p>}
      {children}
    </div>
  );
}

function CategoryFate({
  category,
  changes,
  onClose,
  onDeleted,
}: {
  category: Category;
  changes: CategoryChanges;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { id, name, hidden } = category;
  const used = useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => categoryUsed(records, id),
      [id],
    ),
  );
  const [refusal, attempt] = useAttempt();

  return (
    <Fate refusal={refusal}>
      {hidden && (
        <p className={styles.note}>
          Hidden: {name} is out of the Budget and the Category pickers. Its
          history stays.
        </p>
      )}
      <button
        type="button"
        onClick={() =>
          attempt(() => {
            if (hidden) changes.unhide(category);
            else changes.hide(category);
            onClose();
          })
        }
      >
        {hidden ? "Unhide" : "Hide"} {name}
      </button>
      {used ? (
        <p className={styles.note}>
          {name} can't be deleted, because it has Transactions or Assignments.
          {!hidden && " Hide it instead: its history stays."}
        </p>
      ) : (
        <button
          type="button"
          className={styles.danger}
          onClick={() =>
            attempt(() => {
              changes.deleteCategory(category);
              onDeleted();
            })
          }
        >
          Delete {name}
        </button>
      )}
    </Fate>
  );
}

function GroupFate({
  group,
  others,
  changes,
  onClose,
  onDeleted,
}: {
  group: CategoryGroup;
  others: CategoryGroup[];
  changes: CategoryChanges;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { name, categories, leftOutOfSpentThisMonth } = group;
  const [refusal, attempt] = useAttempt();

  return (
    <Fate refusal={refusal}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          role="switch"
          aria-checked={leftOutOfSpentThisMonth}
          checked={leftOutOfSpentThisMonth}
          onChange={(event) => {
            const leftOut = event.target.checked;
            attempt(() => {
              changes.setLeftOut(group, leftOut);
              // The sheet would keep the toast's Undo out of reach.
              onClose();
            });
          }}
        />
        <span>Leave out of Spent this Month</span>
      </label>
      <p className={styles.note}>
        For money you're saving, so that it isn't read as spending.
      </p>
      {categories.length === 0 ? (
        <button
          type="button"
          className={styles.danger}
          onClick={() =>
            attempt(() => {
              changes.deleteGroup(group);
              onDeleted();
            })
          }
        >
          Delete {name}
        </button>
      ) : (
        <MoveThemAndDelete
          group={group}
          others={others}
          onMove={(toGroupId) =>
            attempt(() => {
              changes.moveThemAndDelete(group, toGroupId);
              onDeleted();
            })
          }
        />
      )}
    </Fate>
  );
}

/** What a Category Group holds, in words. */
function holdings({ categories }: CategoryGroup): string {
  if (categories.every(({ hidden }) => hidden)) {
    const names = categories.map(({ name }) => name).join(", ");
    return `${names}, ${categories.length === 1 ? "which is" : "which are"} hidden`;
  }
  return categories.length === 1
    ? "1 Category"
    : `${categories.length} Categories`;
}

function MoveThemAndDelete({
  group,
  others,
  onMove,
}: {
  group: CategoryGroup;
  others: CategoryGroup[];
  onMove: (toGroupId: string) => void;
}) {
  const [picked, setPicked] = useState<string>();
  const pickerId = useId();
  const to = others.find(({ id }) => id === picked) ?? others[0];

  if (!to) {
    return (
      <p className={styles.note}>
        {group.name} can't be deleted while it holds {holdings(group)}. Add
        another Category Group to move them to.
      </p>
    );
  }
  return (
    <>
      <p className={styles.note}>
        {group.name} can't be deleted while it holds {holdings(group)}. Move
        them first.
      </p>
      <label className={styles.field} htmlFor={pickerId}>
        Move them to
      </label>
      <select
        id={pickerId}
        value={to.id}
        onChange={(event) => setPicked(event.target.value)}
      >
        {others.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onMove(to.id)}>
        Move them and delete {group.name}
      </button>
    </>
  );
}
