import { expect, it } from "vitest";
import type { ChangeRecord } from "../../kernel/change-log";
import { money } from "../../kernel/money";
import { type Month, month, nextMonth } from "../../kernel/month";
import type { AccountOpened } from "../accounts/records";
import { type AssignmentSet, assignmentSubject } from "../assignments/records";
import type { BudgetCreated } from "../budget-setup/records";
import type { TransactionRecorded } from "../transactions/records";
import { available, overspent, readyToAssign } from "./index";

const CATEGORIES = Array.from({ length: 24 }, (_, i) => `category-${i}`);
const ACCOUNTS = ["checking", "savings", "cash"];

/**
 * About ten years of heavy use: three Accounts, 24 Categories assigned every
 * Month (some changed twice), two paydays and about 390 Transactions a Month,
 * a few of them refunds.
 */
function tenYearsOfRecords(): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  let wallTime = Date.UTC(2016, 0, 1);
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const write = (subjectId: string, type: string, payload: unknown) => {
    records.push({
      id: `record-${records.length}`,
      subjectId,
      deviceId: "this-device",
      timestamp: { wallTime: wallTime++, counter: 0 },
      type,
      payload,
    });
  };

  write("budget", "BudgetCreated", {
    version: 1,
    currency: "USD",
  } satisfies BudgetCreated["payload"]);
  for (const accountId of ACCOUNTS) {
    write(accountId, "AccountOpened", {
      version: 1,
      name: accountId,
      kind: "checking",
      openingBalance: money(100000, "USD"),
    } satisfies AccountOpened["payload"]);
  }

  let of: Month = month(2016, 1);
  for (let i = 0; i < 120; i++, of = nextMonth(of)) {
    for (const categoryId of CATEGORIES) {
      const times = random() < 0.1 ? 2 : 1;
      for (let t = 0; t < times; t++) {
        write(assignmentSubject(categoryId, of), "AssignmentSet", {
          version: 1,
          categoryId,
          month: of,
          amount: money(Math.round(random() * 50000), "USD"),
        } satisfies AssignmentSet["payload"]);
      }
    }
    for (let t = 0; t < 390; t++) {
      const day = String(1 + Math.floor(random() * 28)).padStart(2, "0");
      const payday = t < 2;
      const refund = !payday && random() < 0.03;
      const amount = payday
        ? 300000
        : (1 + Math.round(random() * 6000)) * (refund ? 1 : -1);
      write(`transaction-${records.length}`, "TransactionRecorded", {
        version: 1,
        accountId: ACCOUNTS[t % ACCOUNTS.length],
        date: `${of}-${day}`,
        amount: money(amount, "USD"),
        ...(!payday && {
          categoryId: CATEGORIES[Math.floor(random() * CATEGORIES.length)],
        }),
      } satisfies TransactionRecorded["payload"]);
    }
  }
  return records;
}

/** A Month's Available for every Category, its Overspent list and Ready to Assign. */
function calculateMonth(records: readonly ChangeRecord[], of: Month) {
  return {
    available: CATEGORIES.map((id) => available(records, id, of)),
    overspent: overspent(records, of),
    readyToAssign: readyToAssign(records),
  };
}

it("calculates a Month from ten years of records within 50 ms", () => {
  const records = tenYearsOfRecords();
  expect(records.length).toBeGreaterThan(48000);
  // Warm up the code paths (JIT) on other snapshots of the same records.
  for (let run = 0; run < 3; run += 1) {
    calculateMonth([...records], month(2025, 12));
  }

  // Each run gets a new snapshot, as after an append, so nothing calculated
  // before is reused. The median ignores a run slowed by a busy machine (GC,
  // other test files) while still needing most runs to be fast.
  const timings: number[] = [];
  for (let run = 0; run < 7; run += 1) {
    const snapshot = [...records];
    const started = performance.now();
    const result = calculateMonth(snapshot, month(2025, 12));
    timings.push(performance.now() - started);
    expect(result.available).toHaveLength(CATEGORIES.length);
    expect(result.overspent).toBeDefined();
    expect(result.readyToAssign).toBeDefined();
  }
  const elapsed = timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)];

  expect(elapsed).toBeLessThan(50);
});
