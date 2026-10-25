/**
 * The change records Categories publishes. Other slices may read them; they
 * are versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 *
 * The subject of each record is the Category Group or Category it changes.
 * Order is a `position` per thing: the latest record that sets it wins, and
 * ties (from two devices adding at once) fall back to the thing's id.
 */
import type { ChangeRecord } from "../../kernel/change-log";

export type CategoryGroupCreated = ChangeRecord<
  "CategoryGroupCreated",
  { version: 1; name: string; position: number }
>;

export type CategoryGroupRenamed = ChangeRecord<
  "CategoryGroupRenamed",
  { version: 1; name: string }
>;

/** A Category Group's new place among the Category Groups. */
export type CategoryGroupPlaced = ChangeRecord<
  "CategoryGroupPlaced",
  { version: 1; position: number }
>;

export type CategoryCreated = ChangeRecord<
  "CategoryCreated",
  { version: 1; groupId: string; name: string; position: number }
>;

export type CategoryRenamed = ChangeRecord<
  "CategoryRenamed",
  { version: 1; name: string }
>;

/** A Category's new Category Group and its place among that group's Categories. */
export type CategoryPlaced = ChangeRecord<
  "CategoryPlaced",
  { version: 1; groupId: string; position: number }
>;

/** A Category leaves the Month Budget view and the Category pickers; its history stays. */
export type CategoryHidden = ChangeRecord<"CategoryHidden", { version: 1 }>;

/** A hidden Category comes back. */
export type CategoryUnhidden = ChangeRecord<"CategoryUnhidden", { version: 1 }>;

/** A Category that was never used is gone for good. */
export type CategoryDeleted = ChangeRecord<"CategoryDeleted", { version: 1 }>;

/** An empty Category Group is gone for good. */
export type CategoryGroupDeleted = ChangeRecord<
  "CategoryGroupDeleted",
  { version: 1 }
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
  | CategoryGroupDeleted;

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
] satisfies CategoriesRecord["type"][]);

export function isCategoriesRecord(
  record: ChangeRecord,
): record is CategoriesRecord {
  return types.has(record.type);
}
