import { accounts } from "../accounts";

export type TransactionRecorded = { accountId: string };

export function currentTransactions(): TransactionRecorded[] {
  return accounts().map((accountId) => ({ accountId }));
}
