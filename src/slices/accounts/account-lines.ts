import type { AccountKind } from "./records";

export const KIND_LABELS: Record<AccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
};

/** When the balance was last checked, such as "Checked Oct 18". */
export function checkedLine(lastChecked: string | undefined): string {
  if (!lastChecked) return "Not checked yet";
  const day = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${lastChecked}T00:00:00Z`));
  return `Checked ${day}`;
}
