import { describe, expect, it } from "vitest";
import { money } from "../../kernel/money";
import { assignPanel } from "./assign-panel";
import { type CategoryAmounts, categoryRow } from "./category-row";
import type { SheetCategory } from "./category-sheet";

const usd = (dollars: number) => money(Math.round(dollars * 100), "USD");
const october = "2026-10" as const;

function category(
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
    id: "holiday",
    name: "Holiday",
    groupId: "group",
    groupName: "Group",
    lastMonth: usd(lastMonth),
    row: categoryRow({
      carriedForward: usd(carriedForward),
      takenBack: usd(takenBack),
      assigned: usd(assigned),
      spending: usd(spending),
    }),
  };
}

const figure = (panel: ReturnType<typeof assignPanel>, label: RegExp) =>
  panel.lines.find((line) => label.test(line.label))?.amount;

describe("assignPanel", () => {
  it("reads as it stands while nothing different is typed", () => {
    const panel = assignPanel(
      category({ assigned: 100, spending: 40 }),
      usd(500),
      undefined,
      october,
    );
    expect(figure(panel, /^Available/)).toBe("$60.00");
    expect(panel.readyToAssign).toEqual({
      label: "Ready to Assign is",
      amount: usd(500),
    });
    expect(panel.note).toBeUndefined();
  });

  it("shows Available and Ready to Assign as they'd be with what's typed", () => {
    const panel = assignPanel(
      category({ assigned: 100, spending: 40 }),
      usd(500),
      usd(250),
      october,
    );
    expect(figure(panel, /^Assigned in/)).toBe("+ $250.00");
    expect(figure(panel, /^Available/)).toBe("$210.00");
    expect(panel.readyToAssign).toEqual({
      label: "Ready to Assign after",
      amount: usd(350),
    });
  });

  it("reads a typed negative as $0.00 plus a Take-back, and says so", () => {
    const panel = assignPanel(
      category({ carriedForward: 600 }),
      usd(0),
      usd(-42.5),
      october,
    );
    expect(figure(panel, /^Assigned in/)).toBe("+ $0.00");
    expect(figure(panel, /^Taken back/)).toBe("− $42.50");
    expect(figure(panel, /^Available/)).toBe("$557.50");
    expect(panel.readyToAssign.amount).toEqual(usd(42.5));
    expect(panel.note).toBe(
      "Takes $42.50 back from what Holiday carried forward. Its October Assignment stays $0.00.",
    );
  });

  it("offers the sheet's suggestions, from what's saved rather than what's typed", () => {
    const panel = assignPanel(
      category({ assigned: 100, spending: 118 }, 600),
      usd(500),
      usd(1),
      october,
    );
    expect(panel.suggestions).toEqual([
      { label: "Cover it: $118.00", amount: usd(118) },
      { label: "September: $600.00", amount: usd(600) },
      { label: "All of Ready to Assign: $600.00", amount: usd(600) },
    ]);
  });
});
