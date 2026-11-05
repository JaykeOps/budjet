import { describe, expect, it } from "vitest";
import { money } from "../../kernel/money";
import { type CategoryAmounts, categoryRow } from "./category-row";
import {
  assignPreview,
  breakdown,
  mainButton,
  movePreview,
  type SheetCategory,
  suggestions,
} from "./category-sheet";

const usd = (dollars: number) => money(Math.round(dollars * 100), "USD");

function category(
  name: string,
  amounts: Partial<Record<keyof CategoryAmounts, number>>,
  lastMonth = 0,
): SheetCategory {
  const {
    carriedForward = 0,
    takenBack = 0,
    assigned = 0,
    spending = 0,
  } = amounts;
  return {
    id: name.toLowerCase(),
    name,
    groupId: "group",
    groupName: "Group",
    lastMonth: usd(lastMonth),
    nothingAssigned: false,
    row: categoryRow({
      carriedForward: usd(carriedForward),
      takenBack: usd(takenBack),
      assigned: usd(assigned),
      spending: usd(spending),
    }),
  };
}

const october = "2026-10" as const;

describe("breakdown", () => {
  it("adds up to Available: carried forward − Take-back + Assigned − Spending", () => {
    const lines = breakdown(
      category("Rent", {
        carriedForward: 600,
        takenBack: 42.5,
        assigned: 100,
        spending: 50,
      }).row,
      october,
    );
    expect(lines).toEqual([
      { label: "Carried forward from September", amount: "$600.00" },
      { label: "Taken back", amount: "− $42.50" },
      { label: "Assigned in October", amount: "+ $100.00" },
      { label: "Spending", amount: "− $50.00" },
      { label: "Available", amount: "$607.50" },
    ]);
  });

  it("leaves out Taken back when there is none", () => {
    const labels = breakdown(category("Rent", {}).row, october).map(
      ({ label }) => label,
    );
    expect(labels).not.toContain("Taken back");
  });

  it('reads negative Spending as "+ $12.00", never "− −$12.00"', () => {
    const lines = breakdown(category("Rent", { spending: -12 }).row, october);
    expect(lines).toContainEqual({ label: "Spending", amount: "+ $12.00" });
  });

  it("shows a negative carried forward with its own sign", () => {
    const [carried] = breakdown(
      category("Rent", { carriedForward: -5 }).row,
      october,
    );
    expect(carried.amount).toBe("−$5.00");
  });
});

describe("suggestions", () => {
  const labels = (...args: Parameters<typeof suggestions>) =>
    suggestions(...args).map(({ label }) => label);

  it("offers last Month's Assignment and All of Ready to Assign", () => {
    expect(
      suggestions(category("Rent", { assigned: 100 }, 600), usd(50), october),
    ).toEqual([
      { label: "September: $600.00", amount: usd(600) },
      { label: "All of Ready to Assign: $150.00", amount: usd(150) },
    ]);
  });

  it("leaves out last Month's Assignment when it's nothing, or already assigned", () => {
    expect(labels(category("Rent", {}, 0), usd(0), october)).toEqual([]);
    expect(
      labels(category("Rent", { assigned: 600 }, 600), usd(0), october),
    ).toEqual([]);
  });

  it("offers Cover it while Overspent, raising the Assignment by what's short", () => {
    const [cover] = suggestions(
      category("Dining", { assigned: 60, spending: 80 }),
      usd(100),
      october,
    );
    expect(cover).toEqual({ label: "Cover it: $80.00", amount: usd(80) });
  });

  it("offers Give back while Ready to Assign is below zero, up to what the Category has", () => {
    expect(
      suggestions(category("Rent", { assigned: 100 }), usd(-30), october),
    ).toEqual([{ label: "Give back $30.00", amount: usd(70) }]);
    expect(
      suggestions(category("Rent", { assigned: 100 }), usd(-300), october),
    ).toEqual([{ label: "Give back $100.00", amount: usd(0) }]);
  });

  it("gives back from what it carried forward too, through an Assignment below zero", () => {
    expect(
      suggestions(
        category("Holiday", { carriedForward: 600, assigned: 10 }),
        usd(-50),
        october,
      ),
    ).toEqual([{ label: "Give back $50.00", amount: usd(-40) }]);
  });

  it("offers no Give back when the Category has nothing to give", () => {
    expect(
      labels(category("Rent", { spending: 5 }), usd(-30), october),
    ).toEqual(["Cover it: $5.00"]);
  });
});

describe("assignPreview", () => {
  it("shows Available and Ready to Assign after", () => {
    expect(
      assignPreview(
        category("Rent", { assigned: 100 }),
        usd(500),
        usd(150),
        october,
      ),
    ).toEqual({
      availableAfter: usd(150),
      readyToAssignAfter: usd(450),
      note: undefined,
    });
  });

  it("says what will be taken back when the Assignment has nothing left to lower", () => {
    const { availableAfter, readyToAssignAfter, note } = assignPreview(
      category("Holiday", { carriedForward: 600 }),
      usd(0),
      usd(-42.5),
      october,
    );
    expect(availableAfter).toEqual(usd(557.5));
    expect(readyToAssignAfter).toEqual(usd(42.5));
    expect(note).toBe(
      "Takes $42.50 back from what Holiday carried forward. Its October Assignment stays $0.00.",
    );
  });

  it("says what comes from the Assignment and what is taken back", () => {
    const { readyToAssignAfter, note } = assignPreview(
      category("Holiday", { carriedForward: 600, assigned: 10 }),
      usd(0),
      usd(-42.5),
      october,
    );
    expect(readyToAssignAfter).toEqual(usd(52.5));
    expect(note).toBe(
      "Takes $10.00 from Holiday's October Assignment and $42.50 back from what it carried forward.",
    );
  });
});

describe("movePreview", () => {
  const dining = category("Dining", { spending: 20 });

  it("shows Available after for both, lowering the source's Assignment", () => {
    expect(
      movePreview(
        dining,
        category("Rent", { assigned: 100 }),
        usd(20),
        october,
      ),
    ).toEqual({
      availableAfter: usd(0),
      sourceAfter: usd(80),
      note: "Lowers Rent's October Assignment from $100.00 to $80.00.",
    });
  });

  it("says what a move takes back from what the source carried forward", () => {
    expect(
      movePreview(
        dining,
        category("Holiday", { carriedForward: 600 }),
        usd(42.5),
        october,
      ).note,
    ).toBe(
      "Takes $42.50 back from what Holiday carried forward. Its October Assignment stays $0.00.",
    );
  });

  it("has nothing to say about moving nothing", () => {
    expect(
      movePreview(dining, category("Rent", { assigned: 100 }), usd(0), october)
        .note,
    ).toBeUndefined();
  });
});

describe("mainButton", () => {
  it('reads "Next Category" with nothing changed, and "Done" on the last Category', () => {
    expect(mainButton({ kind: "unchanged" }, false)).toBe("Next Category");
    expect(mainButton({ kind: "unchanged" }, true)).toBe("Done");
  });

  it("says how much moves, and that it moves on", () => {
    expect(mainButton({ kind: "raise", by: usd(18) }, false)).toBe(
      "Assign $18.00 and next",
    );
    expect(mainButton({ kind: "lower", by: usd(18) }, false)).toBe(
      "Take back $18.00 and next",
    );
    expect(mainButton({ kind: "move", by: usd(18) }, false)).toBe(
      "Move $18.00 and next",
    );
    expect(mainButton({ kind: "raise", by: usd(18) }, true)).toBe(
      "Assign $18.00",
    );
  });
});
