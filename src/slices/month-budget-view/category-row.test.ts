import { describe, expect, it } from "vitest";
import {
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../../kernel/change-log";
import { money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import {
  type AssignmentSet,
  assignmentSubject,
  type TakeBackSet,
} from "../assignments/records";
import type { BudgetCreated } from "../budget-setup/records";
import { available } from "../budget-totals";
import type { TransactionRecorded } from "../transactions/records";
import {
  type CategoryAmounts,
  categoryRow,
  categoryRowIn,
  overspentHint,
} from "./category-row";

const usd = (dollars: number) => money(Math.round(dollars * 100), "USD");

function row(
  amounts: Partial<Record<keyof CategoryAmounts, number>>,
): ReturnType<typeof categoryRow> {
  const {
    carriedForward = 0,
    takenBack = 0,
    assigned = 0,
    spending = 0,
  } = amounts;
  return categoryRow({
    carriedForward: usd(carriedForward),
    takenBack: usd(takenBack),
    assigned: usd(assigned),
    spending: usd(spending),
  });
}

describe("categoryRow", () => {
  it("measures Spending against carried forward less Take-back plus Assignment", () => {
    const groceries = row({
      carriedForward: 100,
      takenBack: 40,
      assigned: 540,
      spending: 150,
    });

    expect(groceries.note).toBe("$150.00 of $600.00 spent");
    expect(groceries.meter).toBe(0.25);
    expect(groceries.available).toEqual(usd(450));
    expect(groceries.state).toBe("available");
  });

  it("reads zero Spending against what it has", () => {
    const row50 = row({ assigned: 50 });
    expect(row50.note).toBe("$0.00 of $50.00 spent");
    expect(row50.meter).toBe(0);
  });

  it("says when there is nothing to measure against", () => {
    const empty = row({});
    expect(empty.note).toBe("Nothing assigned yet");
    expect(empty.state).toBe("zero");
    expect(empty.meter).toBe(0);
  });

  it("doesn't say nothing is assigned when an Assignment covers what carried forward", () => {
    expect(row({ carriedForward: -50, assigned: 50 }).note).toBe(
      "$0.00 of $0.00 spent",
    );
  });

  it("is zero, not Overspent, when everything is spent", () => {
    const spent = row({ assigned: 50, spending: 50 });
    expect(spent.state).toBe("zero");
    expect(spent.meter).toBe(1);
    expect(spent.note).toBe("$50.00 of $50.00 spent");
  });

  describe("negative Spending", () => {
    it("reads as a signed figure with no 'of' and an empty meter", () => {
      const refunded = row({ assigned: 100, spending: -12 });
      expect(refunded.note).toBe("−$12.00 spent");
      expect(refunded.meter).toBe(0);
    });

    it("replaces 'Nothing assigned yet'", () => {
      expect(row({ spending: -12 }).note).toBe("−$12.00 spent");
    });
  });

  describe("Overspent", () => {
    it("has a full meter and says by how much", () => {
      const over = row({ assigned: 62, spending: 80 });
      expect(over.state).toBe("overspent");
      expect(over.meter).toBe(1);
      expect(over.note).toBe("Overspent by $18.00");
    });

    it("wins over negative Spending", () => {
      const over = row({ carriedForward: -30, spending: -12 });
      expect(over.state).toBe("overspent");
      expect(over.meter).toBe(1);
      expect(over.note).toBe("Overspent by $18.00");
    });

    it("explains itself with the Category's own numbers", () => {
      expect(
        overspentHint("Dining Out", row({ assigned: 60, spending: 80 })),
      ).toBe(
        "Dining Out had $60.00 and spent $80.00. Cover the $20.00, or it stays red, Month after Month.",
      );
    });
  });

  describe("what it carried", () => {
    it("is quiet when nothing carried forward or was taken back", () => {
      expect(row({ assigned: 10 }).carried).toBeUndefined();
    });

    it("names what carried forward", () => {
      expect(row({ carriedForward: 600 }).carried).toBe(
        "$600.00 carried forward",
      );
    });

    it("adds what was taken back", () => {
      expect(row({ carriedForward: 600, takenBack: 42.5 }).carried).toBe(
        "$600.00 carried forward, $42.50 taken back",
      );
    });

    it("names a Take-back alone when nothing carried forward", () => {
      expect(row({ takenBack: 42.5 }).carried).toBe("$42.50 taken back");
    });
  });
});

describe("categoryRowIn", () => {
  it("agrees with Budget Totals' Available, which stays the one calculation of it", () => {
    const log = createInMemoryChangeLog();
    const writer = createChangeLogWriter(log, "phone");
    writer.write<BudgetCreated["type"], BudgetCreated["payload"]>(
      "budget",
      "BudgetCreated",
      { version: 1, currency: "USD" },
    );
    const amountIn = (month: Month, dollars: number) => ({
      version: 1 as const,
      categoryId: "groceries",
      month,
      amount: usd(dollars),
    });
    writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
      assignmentSubject("groceries", "2026-10"),
      "AssignmentSet",
      amountIn("2026-10", 300),
    );
    writer.write<TakeBackSet["type"], TakeBackSet["payload"]>(
      assignmentSubject("groceries", "2026-11"),
      "TakeBackSet",
      amountIn("2026-11", 40),
    );
    writer.write<AssignmentSet["type"], AssignmentSet["payload"]>(
      assignmentSubject("groceries", "2026-11"),
      "AssignmentSet",
      amountIn("2026-11", 25),
    );
    writer.write<TransactionRecorded["type"], TransactionRecorded["payload"]>(
      "lunch",
      "TransactionRecorded",
      {
        version: 1,
        accountId: "checking",
        date: "2026-11-03",
        amount: usd(-312.5),
        categoryId: "groceries",
      },
    );
    const records = log.readAll();

    for (const of of ["2026-10", "2026-11", "2026-12"] as const) {
      expect(categoryRowIn(records, "groceries", of, "USD").available).toEqual(
        available(records, "groceries", of),
      );
    }
    expect(
      categoryRowIn(records, "groceries", "2026-11", "USD").available,
    ).toEqual(usd(-27.5));
  });
});
