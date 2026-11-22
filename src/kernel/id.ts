/**
 * Ids that know what they identify, so an Account's id can't go where a
 * Category's is wanted. The kind is a brand: it exists only for the compiler,
 * and at runtime an id is a plain string. So an id is made by a cast, and only
 * in a few trusted places: where it's created (`newId`), and where it comes in
 * from outside, such as a URL parameter (`asId`).
 */
declare const kind: unique symbol;

/** Every kind of thing in a Budget that has an id. */
export type IdKind =
  | "Budget"
  | "Account"
  | "Category"
  | "CategoryGroup"
  | "Transaction"
  | "Transfer"
  | "Assignment"
  | "ChangeRecord";

export type Id<Kind extends IdKind> = string & { readonly [kind]: Kind };

/** A new id, e.g. `newId<AccountId>()`. */
export function newId<Of extends Id<IdKind>>(): Of {
  return crypto.randomUUID() as Of;
}

/**
 * Trusts a string from outside (a URL parameter, a form value) to be an id of
 * this kind. Every other id comes from a Change Record already typed.
 */
export function asId<Of extends Id<IdKind>>(value: string): Of {
  return value as Of;
}

export type AccountId = Id<"Account">;
export type CategoryId = Id<"Category">;
export type CategoryGroupId = Id<"CategoryGroup">;
export type TransactionId = Id<"Transaction">;
export type TransferId = Id<"Transfer">;
