import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { type AssignmentSet, assignmentSubject } from "../assignments/records";
import type { BudgetCreated } from "../budget-setup/records";
import type {
  CategoryCreated,
  CategoryGroupCreated,
  CategoryHidden,
} from "../categories/records";
import { hiddenWithMoney } from "./hidden-money";

const october: Month = "2026-10";

/** A Budget in USD with one Category Group, seeded with the records other slices publish. */
function budget() {
  const writer = createChangeLogWriter(
    createInMemoryChangeLog(),
    "this-device",
  );
  writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
    "budget",
    "BudgetCreated",
    { version: 1, currency: "USD" },
  );
  writer.write<CategoryGroupCreated["type"], CategoryGroupCreated["payload"]>(
    "everyday",
    "CategoryGroupCreated",
    { version: 1, name: "Everyday", position: 0 },
  );
  let position = 0;
  const add = (name: string) => {
    const id = name.toLowerCase();
    writer.write<CategoryCreated["type"], CategoryCreated["payload"]>(
      id,
      "CategoryCreated",
      { version: 1, groupId: "everyday", name, position },
    );
    position += 1;
    return id;
  };
  const assign = (categoryId: string, month: Month, cents: number) =>
    writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
      assignmentSubject(categoryId, month),
      "AssignmentSet",
      { version: 1, categoryId, month, amount: money(cents, "USD") },
    );
  const hide = (categoryId: string) =>
    writer.write<CategoryHidden["type"], CategoryHidden["payload"]>(
      categoryId,
      "CategoryHidden",
      { version: 1 },
    );
  const lines = (of: Month = october) =>
    hiddenWithMoney(writer.changeLog.readAll(), of);
  return { add, assign, hide, lines };
}

describe("the hidden Category line", () => {
  it("flags a hidden Category that later gains money, in Budget order", () => {
    const { add, assign, hide, lines } = budget();
    const gym = add("Gym");
    const pool = add("Pool");
    hide(gym);
    hide(pool);
    assign(gym, october, 1250);
    assign(pool, october, 300);

    expect(lines()).toEqual([
      {
        id: gym,
        name: "Gym",
        text: "Gym is hidden and has $12.50 Available.",
        action: "Move it",
      },
      {
        id: pool,
        name: "Pool",
        text: "Pool is hidden and has $3.00 Available.",
        action: "Move it",
      },
    ]);
  });

  it("says Overspent by, with Cover it, when it has gone below zero", () => {
    const { add, assign, hide, lines } = budget();
    const gym = add("Gym");
    hide(gym);
    assign(gym, "2026-11", -1800);

    expect(lines("2026-11")).toEqual([
      {
        id: gym,
        name: "Gym",
        text: "Gym is hidden and is Overspent by $18.00.",
        action: "Cover it",
      },
    ]);
  });

  it("leaves out visible Categories and hidden ones at $0.00", () => {
    const { add, assign, hide, lines } = budget();
    const rent = add("Rent");
    const gym = add("Gym");
    assign(rent, october, 5000);
    hide(gym);

    expect(lines()).toEqual([]);
  });

  it("reads Available in the Month being shown", () => {
    const { add, assign, hide, lines } = budget();
    const gym = add("Gym");
    hide(gym);
    assign(gym, "2026-11", 500);

    expect(lines(october)).toEqual([]);
    expect(lines("2026-11")).toHaveLength(1);
  });
});
