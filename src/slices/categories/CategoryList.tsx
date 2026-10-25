import { type FormEvent, type ReactNode, useState } from "react";
import {
  useChangeLogQuery,
  useChangeLogWriter,
} from "../../kernel/use-change-log-query";
import {
  createCategory,
  createCategoryGroup,
  moveCategory,
  moveCategoryGroup,
  renameCategory,
  renameCategoryGroup,
} from "./commands";
import { type Category, type CategoryGroup, categoryGroups } from "./queries";

/** The Category Groups and their Categories, to create, rename, reorder and move. */
export function CategoryList() {
  const writer = useChangeLogWriter();
  const groups = useChangeLogQuery(categoryGroups);

  return (
    <section aria-labelledby="categories-heading">
      <h2 id="categories-heading">Categories</h2>
      {groups.map((group, index) => (
        <GroupSection
          key={group.id}
          group={group}
          groups={groups}
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

function GroupSection({
  group,
  groups,
  index,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  group: CategoryGroup;
  groups: CategoryGroup[];
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
      <ul>
        {group.categories.map((category, position) => (
          <CategoryRow
            key={category.id}
            category={category}
            group={group}
            groups={groups}
            position={position}
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
}: {
  category: Category;
  group: CategoryGroup;
  groups: CategoryGroup[];
  position: number;
}) {
  const writer = useChangeLogWriter();

  return (
    <li>
      <Renamable
        name={category.name}
        onRename={(name) => renameCategory(writer, category.id, { name })}
      >
        <span className="category-name">{category.name}</span>
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
      </select>
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
