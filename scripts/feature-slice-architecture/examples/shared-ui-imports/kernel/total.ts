import type { Money } from "./money";

export const total = (amounts: readonly Money[]): number =>
  amounts.reduce((sum, amount) => sum + amount.minorUnits, 0);
