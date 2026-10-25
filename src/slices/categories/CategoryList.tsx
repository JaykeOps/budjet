import { type FormEvent, type ReactNode, useState } from "react";
import { currentMonth } from "../../kernel/month";
import {
  useChangeLogQuery,
  useChangeLogWriter,
} from "../../kernel/use-change-log-query";
import {
  CategoryInUseError,
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  hideCategory,
  moveCategory,
  moveCategoryGroup,
  renameCategory,
  renameCategoryGroup,
  unhideCategory,
} from "./commands";
import { type Category, type CategoryGroup, categoryGroups } from "./queries";

/** Runs a change, showing why if it is refused. */
type Attempt = (action: () => void) => void;

/** A refused change: why, and for a used Category, the offer to hide it instead. */
type Refusal = { message: string; hide?: { categoryId: string; name: string } };

/**
 * The Category Groups and their Categories, to create, rename, reorder, move,
 * hide, unhide and delete. Hidden Categories stay listed so they can be
 * unhidden.
 */
export function CategoryList() {
  const writer = useChangeLogWriter();
  const groups = useChangeLogQuery(categoryGroups);
  const [refusal, setRefusal] = useState<Refusal>();

  const attempt: Attempt = (action) => {
    try {
      action();
      setRefusal(undefined);
    } catch (failure) {
      if (failure instanceof CategoryInUseError) {
        const name = categoryName(groups, failure.categoryId);
        setRefusal({
          message: failure.message,
          hide: { categoryId: failure.categoryId, name },
        });
      } else {
        setRefusal({
          message: failure instanceof Error ? failure.message : String(failure),
        });
      }
    }
  };

  return (
    <section aria-labelledby="categories-heading">
      <h2 id="categories-heading">Categories</h2>
      {refusal && (
        <div role="alert">
          {refusal.message}
          {refusal.hide && (
            <>
              {" "}
              <HideButton
                categoryId={refusal.hide.categoryId}
                label={`Hide ${refusal.hide.name} instead`}
                attempt={attempt}
              />
            </>
          )}
        </div>
      )}
      {groups.map((group, index) => (
        <GroupSection
          key={group.id}
          group={group}
          groups={groups}
          attempt={attempt}
          onMove={(toIndex) => moveCategoryGroup(writer, group.id, { toIndex })}
          canMoveUp={index > 0}
          canMoveDown={index < groups.length - 1}
          index={index}
        />
      ))}
      <AddForm
        label="New Category Group"
        button="Add Category Group"
        onAdd={(name) => createCategoryGroup(writer, { name })}
      />
    </section>
  );
}

function categoryName(groups: CategoryGroup[], categoryId: string): string {
  return (
    groups
      .flatMap((group) => group.categories)
      .find(({ id }) => id === categoryId)?.name ?? "it"
  );
}

function HideButton({
  categoryId,
  label,
  text = label,
  attempt,
}: {
  categoryId: string;
  /** Its accessible name. */
  label: string;
  /** What it shows, when shorter than its label. */
  text?: string;
  attempt: Attempt;
}) {
  const writer = useChangeLogWriter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() =>
        attempt(() =>
          hideCategory(writer, categoryId, { currentMonth: currentMonth() }),
        )
      }
    >
      {text}
    </button>
  );
}

function GroupSection({
  group,
  groups,
  attempt,
  index,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  group: CategoryGroup;
  groups: CategoryGroup[];
  attempt: Attempt;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (toIndex: number) => void;
}) {
  const writer = useChangeLogWriter();
  const headingId = `category-group-${group.id}`;

  return (
    <section aria-labelledby={headingId}>
      <Renamable
        name={group.name}
        onRename={(name) => renameCategoryGroup(writer, group.id, { name })}
      >
        <h3 id={headingId}>{group.name}</h3>
      </Renamable>
      <MoveButtons
        name={group.name}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMove={(by) => onMove(index + by)}
      />
      <button
        type="button"
        aria-label={`Delete ${group.name}`}
        onClick={() => attempt(() => deleteCategoryGroup(writer, group.id))}
      >
        Delete
      </button>
      <ul>
        {group.categories.map((category, position) => (
          <CategoryRow
            key={category.id}
            category={category}
            group={group}
            groups={groups}
            position={position}
            attempt={attempt}
          />
        ))}
      </ul>
      <AddForm
        label={`New Category in ${group.name}`}
        button={`Add Category to ${group.name}`}
        onAdd={(name) => createCategory(writer, { groupId: group.id, name })}
      />
    </section>
  );
}

function CategoryRow({
  category,
  group,
  groups,
  position,
  attempt,
}: {
  category: Category;
  group: CategoryGroup;
  groups: CategoryGroup[];
  position: number;
  attempt: Attempt;
}) {
  const writer = useChangeLogWriter();

  return (
    <li>
      <Renamable
        name={category.name}
        onRename={(name) => renameCategory(writer, category.id, { name })}
      >
        <span className="category-name">{category.name}</span>
        {category.hidden && " (hidden)"}
      </Renamable>
      <MoveButtons
        name={category.name}
        canMoveUp={position > 0}
        canMoveDown={position < group.categories.length - 1}
        onMove={(by) =>
          moveCategory(writer, category.id, {
            groupId: group.id,
            toIndex: position + by,
          })
        }
      />
      <select
        aria-label={`Category Group of ${category.name}`}
        value={group.id}
        onChange={(event) => {
          const target = groups.find(({ id }) => id === event.target.value);
          if (!target) return;
          moveCategory(writer, category.id, {
            groupId: target.id,
            toIndex: target.categories.length,
          });
        }}
      >
        {groups.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>{" "}
      {category.hidden ? (
        <button
          type="button"
          aria-label={`Unhide ${category.name}`}
          onClick={() => attempt(() => unhideCategory(writer, category.id))}
        >
          Unhide
        </button>
      ) : (
        <HideButton
          categoryId={category.id}
          label={`Hide ${category.name}`}
          text="Hide"
          attempt={attempt}
        />
      )}{" "}
      <button
        type="button"
        aria-label={`Delete ${category.name}`}
        onClick={() => attempt(() => deleteCategory(writer, category.id))}
      >
        Delete
      </button>
    </li>
  );
}

function MoveButtons({
  name,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  name: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (by: -1 | 1) => void;
}) {
  return (
    <>
      {" "}
      <button
        type="button"
        aria-label={`Move ${name} up`}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>{" "}
      <button
        type="button"
        aria-label={`Move ${name} down`}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
      >
        ↓
      </button>{" "}
    </>
  );
}

/** Shows its children, or a form to rename the thing they show. */
function Renamable({
  name,
  onRename,
  children,
}: {
  name: string;
  onRename: (name: string) => void;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);

  if (draft === undefined) {
    return (
      <>
        {children}{" "}
        <button
          type="button"
          aria-label={`Rename ${name}`}
          onClick={() => setDraft(name)}
        >
          Rename
        </button>
      </>
    );
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (draft !== undefined) onRename(draft);
    setDraft(undefined);
  }

  return (
    <form onSubmit={save}>
      <label>
        New name for {name}{" "}
        <input
          required
          pattern=".*\S.*"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>{" "}
      <button type="submit">Save</button>{" "}
      <button type="button" onClick={() => setDraft(undefined)}>
        Cancel
      </button>
    </form>
  );
}

function AddForm({
  label,
  button,
  onAdd,
}: {
  label: string;
  button: string;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  function add(event: FormEvent) {
    event.preventDefault();
    onAdd(name);
    setName("");
  }

  return (
    <form onSubmit={add}>
      <label>
        {label}{" "}
        <input
          required
          pattern=".*\S.*"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>{" "}
      <button type="submit" aria-label={button}>
        Add
      </button>
    </form>
  );
}
