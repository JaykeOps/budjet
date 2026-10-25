import { describe, expect, it } from "vitest";
import {
  currentMonth,
  month,
  monthName,
  monthOf,
  nextMonth,
  parseMonth,
  previousMonth,
} from "./month";

describe("Month", () => {
  it("is the calendar month a date falls in", () => {
    expect(monthOf("2026-10-25")).toBe(month(2026, 10));
    expect(monthOf("2026-01-01")).toBe("2026-01");
  });

  it("is the Month of today's local date", () => {
    expect(currentMonth(new Date(2026, 9, 31, 23, 59))).toBe("2026-10");
    expect(currentMonth(new Date(2027, 0, 1, 0, 0))).toBe("2027-01");
  });

  it("is named for people by month and year", () => {
    expect(monthName(month(2026, 10), "en-US")).toBe("October 2026");
  });

  it("steps across the turn of the year", () => {
    expect(nextMonth(month(2026, 12))).toBe("2027-01");
    expect(previousMonth(month(2027, 1))).toBe("2026-12");
  });

  it("is read back from how it is written", () => {
    expect(parseMonth("2026-12")).toBe(month(2026, 12));
    expect(parseMonth("2026-13")).toBeUndefined();
    expect(parseMonth("2026-1")).toBeUndefined();
    expect(parseMonth("December")).toBeUndefined();
    expect(parseMonth(null)).toBeUndefined();
  });

  it("rejects something that is not a calendar month", () => {
    expect(() => month(2026, 13)).toThrow(RangeError);
    expect(() => monthOf("25/10/2026")).toThrow(RangeError);
  });
});
