import { describe, expect, it } from "vitest";
import { month, monthOf, nextMonth, previousMonth } from "./month";

describe("Month", () => {
  it("is the calendar month a date falls in", () => {
    expect(monthOf("2026-10-25")).toBe(month(2026, 10));
    expect(monthOf("2026-01-01")).toBe("2026-01");
  });

  it("steps across the turn of the year", () => {
    expect(nextMonth(month(2026, 12))).toBe("2027-01");
    expect(previousMonth(month(2027, 1))).toBe("2026-12");
  });

  it("rejects something that is not a calendar month", () => {
    expect(() => month(2026, 13)).toThrow(RangeError);
    expect(() => monthOf("25/10/2026")).toThrow(RangeError);
  });
});
