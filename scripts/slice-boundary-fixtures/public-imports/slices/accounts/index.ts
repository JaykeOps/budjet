import type { AccountOpened } from "./records";

export const accountNames = (records: readonly AccountOpened[]) =>
  records.map((record) => record.name);
