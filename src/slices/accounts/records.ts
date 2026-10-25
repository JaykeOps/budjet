/**
 * The change records Accounts publishes. Other slices may read them; they are
 * versioned contracts, so changing one is a cross-slice change (docs/adr/0005).
 */
import type { ChangeRecord } from "../../kernel/change-log";
import type { Money } from "../../kernel/money";

/** Where an Account's money sits. Credit cards and loans are not Accounts. */
export type AccountKind = "checking" | "savings" | "cash";

/** An Account added to the Budget. Its Opening Balance goes to Ready to Assign. */
export type AccountOpened = ChangeRecord<
  "AccountOpened",
  { version: 1; name: string; kind: AccountKind; openingBalance: Money }
>;

export function isAccountOpened(record: ChangeRecord): record is AccountOpened {
  return record.type === "AccountOpened";
}
