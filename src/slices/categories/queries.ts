import { type ChangeRecord, deletedSubjects } from "../../kernel/change-log";
import type { CategoryId } from "../../kernel/id";
import { isCategoriesRecord } from "./records";

export type Category = { id: CategoryId; name: string; hidden: boolean };
export type CategoryGroup = {
  id: string;
  name: string;
  leftOutOfSpentThisMonth: boolean;
  categories: Category[];
};

type Placed<Id extends string> = { id: Id; name: string; position: number };

/**
 * The Category Groups in order, each with its Categories in order. Every
 * Category belongs to exactly one Category Group. Hidden Categories are
 * listed, marked hidden; deleted ones and deleted Category Groups are gone.
 * Category Groups are never hidden.
 */
export function categoryGroups(
  records: readonly ChangeRecord[],
): CategoryGroup[] {
  const groups = new Map<string, Placed<string> & { leftOut: boolean }>();
  const categories = new Map<
    CategoryId,
    Placed<CategoryId> & { groupId: string; hidden: boolean }
  >();
  // Once deleted, a thing stays deleted, whatever other devices did to it.
  const deleted = deletedSubjects(
    records,
    ({ type }) => type === "CategoryDeleted" || type === "CategoryGroupDeleted",
  );

  // Records come oldest first, so each later record overwrites what it changes.
  for (const record of records) {
    if (!isCategoriesRecord(record)) continue;
    // Each case reads its own subject: a Category Group's or a Category's id.
    const group = groups.get(record.subjectId);
    switch (record.type) {
      case "CategoryGroupCreated":
        groups.set(record.subjectId, {
          id: record.subjectId,
          ...nameAndPosition(record.payload),
          leftOut: false,
        });
        break;
      case "CategoryGroupRenamed":
        if (group) group.name = record.payload.name;
        break;
      case "CategoryGroupPlaced":
        if (group) group.position = record.payload.position;
        break;
      case "CategoryGroupSpentThisMonthSet":
        if (group) group.leftOut = record.payload.leftOut;
        break;
      case "CategoryCreated":
        categories.set(record.subjectId, {
          id: record.subjectId,
          ...nameAndPosition(record.payload),
          groupId: record.payload.groupId,
          hidden: false,
        });
        break;
      case "CategoryRenamed": {
        const category = categories.get(record.subjectId);
        if (category) category.name = record.payload.name;
        break;
      }
      case "CategoryPlaced": {
        const category = categories.get(record.subjectId);
        if (category) {
          category.groupId = record.payload.groupId;
          category.position = record.payload.position;
        }
        break;
      }
      case "CategoryHidden":
      case "CategoryUnhidden": {
        const category = categories.get(record.subjectId);
        if (category) category.hidden = record.type === "CategoryHidden";
        break;
      }
    }
  }

  const all = [...categories.values()].filter(({ id }) => !deleted.has(id));
  const kept = [...groups.values()].filter(({ id }) => !deleted.has(id));
  return inOrder(kept).map((group) => ({
    id: group.id,
    name: group.name,
    leftOutOfSpentThisMonth: group.leftOut,
    categories: inOrder(all.filter(({ groupId }) => groupId === group.id)).map(
      ({ id, name, hidden }) => ({ id, name, hidden }),
    ),
  }));
}

function nameAndPosition({
  name,
  position,
}: {
  name: string;
  position: number;
}) {
  return { name, position };
}

function inOrder<Thing extends Placed<string>>(things: Thing[]): Thing[] {
  return things.sort(
    (a, b) =>
      a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
