import type { Money } from "../../kernel/money";

export type CoverCandidate = {
  id: string;
  groupId: string;
  assigned: Money;
  available: Money;
};

/**
 * Where to suggest covering `amount` for a Category from, in Budget order: the
 * first match, most Available first within each tier.
 *
 * 1. Same Category Group, covering the whole amount from this Month's Assignment.
 * 2. Another Group that does.
 * 3. One needing a Take-back.
 * 4. Whatever can give the most.
 *
 * Undefined when no other Category has anything to give.
 */
export function coveringSource(
  candidates: readonly CoverCandidate[],
  target: { id: string; groupId: string },
  amount: Money,
): string | undefined {
  const others = candidates
    .filter(({ id, available }) => id !== target.id && available.minorUnits > 0)
    .toSorted((a, b) => b.available.minorUnits - a.available.minorUnits);
  const fromAssignment = others.filter(
    ({ assigned, available }) =>
      Math.min(assigned.minorUnits, available.minorUnits) >= amount.minorUnits,
  );
  return (
    fromAssignment.find(({ groupId }) => groupId === target.groupId) ??
    fromAssignment[0] ??
    others.find(({ available }) => available.minorUnits >= amount.minorUnits) ??
    others[0]
  )?.id;
}
