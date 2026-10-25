import { openAccount } from "../accounts/commands";

export const openBoth = (from: string, to: string) => [
  openAccount(from),
  openAccount(to),
];
