import type { ChangeRecord } from "../../kernel/change-log";
import { isCategoriesRecord } from "./records";

export type Category = { id: string; name: string; hidden: boolean };
export type CategoryGroup = {
  id: string;
  name: string;
  hidden: boolean;
  categories: Category[];
};

type Placed = { id: string; name: string; position: number };

/**
 * The Category Groups in order, each with its Categories in order. Every
 * Category belongs to exactly one Category Group. Hidden Categories are
 * listed, marked hidden; deleted ones and deleted Category Groups are gone.
 * Category Groups are never hidden.
 */
export function categoryGroups(
  records: readonly ChangeRecord[],
): CategoryGroup[] {
  const groups = new Map<string, Placed>();
  const categories = new Map<
    string,
    Placed & { groupId: string; hidden: boolean }
  >();
  // Once deleted, a thing stays deleted, whatever other devices did to it.
  const deleted = new Set<string>();

  // Records come oldest first, so each later record overwrites what it changes.
  for (const record of records) {
    if (!isCategoriesRecord(record)) continue;
    const { subjectId: id } = record;
    const group = groups.get(id);
    const category = categories.get(id);
    switch (record.type) {
      case "CategoryGroupCreated":
        groups.set(id, { id, ...pick(record.payload) });
        break;
      case "CategoryGroupRenamed":
        if (group) group.name = record.payload.name;
        break;
      case "CategoryGroupPlaced":
        if (group) group.position = record.payload.position;
        break;
      case "CategoryCreated":
        categories.set(id, {
          id,
          ...pick(record.payload),
          groupId: record.payload.groupId,
          hidden: false,
        });
        break;
      case "CategoryRenamed":
        if (category) category.name = record.payload.name;
        break;
      case "CategoryPlaced":
        if (category) {
          category.groupId = record.payload.groupId;
          category.position = record.payload.position;
        }
        break;
      case "CategoryHidden":
      case "CategoryUnhidden":
        if (category) category.hidden = record.type === "CategoryHidden";
        break;
      case "CategoryDeleted":
      case "CategoryGroupDeleted":
        deleted.add(id);
        break;
    }
  }

  const all = [...categories.values()].filter(({ id }) => !deleted.has(id));
  const kept = [...groups.values()].filter(({ id }) => !deleted.has(id));
  return inOrder(kept).map((group) => ({
    id: group.id,
    name: group.name,
    hidden: false,
    categories: inOrder(all.filter(({ groupId }) => groupId === group.id)).map(
      ({ id, name, hidden }) => ({ id, name, hidden }),
    ),
  }));
}

function pick({ name, position }: { name: string; position: number }) {
  return { name, position };
}

function inOrder<Thing extends Placed>(things: Thing[]): Thing[] {
  return things.sort(
    (a, b) =>
      a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
