/**
 * The change records Categories publishes. Other slices may read them; they
 * are versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 *
 * The subject of each record is the Category Group or Category it changes.
 * Order is a `position` per thing: the latest record that sets it wins, and
 * ties (from two devices adding at once) fall back to the thing's id.
 */
import type { ChangeRecord } from "../../kernel/change-log";
import type { CategoryGroupId, CategoryId } from "../../kernel/id";

export type CategoryGroupCreated = ChangeRecord<
  "CategoryGroupCreated",
  { version: 1; name: string; position: number },
  CategoryGroupId
>;

export type CategoryGroupRenamed = ChangeRecord<
  "CategoryGroupRenamed",
  { version: 1; name: string },
  CategoryGroupId
>;

/** A Category Group's new place among the Category Groups. */
export type CategoryGroupPlaced = ChangeRecord<
  "CategoryGroupPlaced",
  { version: 1; position: number },
  CategoryGroupId
>;

export type CategoryCreated = ChangeRecord<
  "CategoryCreated",
  { version: 1; groupId: CategoryGroupId; name: string; position: number },
  CategoryId
>;

export type CategoryRenamed = ChangeRecord<
  "CategoryRenamed",
  { version: 1; name: string },
  CategoryId
>;

/** A Category's new Category Group and its place among that group's Categories. */
export type CategoryPlaced = ChangeRecord<
  "CategoryPlaced",
  { version: 1; groupId: CategoryGroupId; position: number },
  CategoryId
>;

/** A Category leaves the Month Budget view and the Category pickers; its history stays. */
export type CategoryHidden = ChangeRecord<
  "CategoryHidden",
  { version: 1 },
  CategoryId
>;

/** A hidden Category comes back. */
export type CategoryUnhidden = ChangeRecord<
  "CategoryUnhidden",
  { version: 1 },
  CategoryId
>;

/** A Category that was never used is gone for good. */
export type CategoryDeleted = ChangeRecord<
  "CategoryDeleted",
  { version: 1 },
  CategoryId
>;

/** An empty Category Group is gone for good. */
export type CategoryGroupDeleted = ChangeRecord<
  "CategoryGroupDeleted",
  { version: 1 },
  CategoryGroupId
>;

/**
 * Whether a Category Group is left out of Spent this Month, so saving doesn't
 * read as spending. Its subject is the Category Group's id, and the latest
 * wins. A Category Group with no such record is counted.
 */
export type CategoryGroupSpentThisMonthSet = ChangeRecord<
  "CategoryGroupSpentThisMonthSet",
  { version: 1; leftOut: boolean },
  CategoryGroupId
>;

export type CategoriesRecord =
  | CategoryGroupCreated
  | CategoryGroupRenamed
  | CategoryGroupPlaced
  | CategoryCreated
  | CategoryRenamed
  | CategoryPlaced
  | CategoryHidden
  | CategoryUnhidden
  | CategoryDeleted
  | CategoryGroupDeleted
  | CategoryGroupSpentThisMonthSet;

const types = new Set<string>([
  "CategoryGroupCreated",
  "CategoryGroupRenamed",
  "CategoryGroupPlaced",
  "CategoryCreated",
  "CategoryRenamed",
  "CategoryPlaced",
  "CategoryHidden",
  "CategoryUnhidden",
  "CategoryDeleted",
  "CategoryGroupDeleted",
  "CategoryGroupSpentThisMonthSet",
] satisfies CategoriesRecord["type"][]);

export function isCategoriesRecord(
  record: ChangeRecord,
): record is CategoriesRecord {
  return types.has(record.type);
}
