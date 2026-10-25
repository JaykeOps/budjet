import { accountNames } from "../accounts";
import type { AccountOpened } from "../accounts/records.js";

export const payees = (records: readonly AccountOpened[]) =>
  accountNames(records);
