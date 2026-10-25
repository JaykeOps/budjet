import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, money, parseMoney } from "./money";

describe("Money", () => {
  it("is a whole number of minor units", () => {
    expect(money(1050, "USD")).toEqual({ minorUnits: 1050, currency: "USD" });
    expect(() => money(10.5, "USD")).toThrow(/whole number of minor units/);
  });

  it("adds amounts in the same currency exactly", () => {
    // 0.1 + 0.2 in floating point is 0.30000000000000004.
    expect(addMoney(money(10, "EUR"), money(20, "EUR"))).toEqual(
      money(30, "EUR"),
    );
  });

  it("refuses to add amounts in different currencies", () => {
    expect(() => addMoney(money(1, "EUR"), money(1, "USD"))).toThrow(
      /EUR and USD/,
    );
  });

  it("formats with the currency's own number of minor digits", () => {
    expect(formatMoney(money(123456, "USD"), "en-US")).toBe("$1,234.56");
    expect(formatMoney(money(-500, "JPY"), "en-US")).toBe("-¥500");
  });

  it("reads a typed amount exactly, in the currency's minor units", () => {
    expect(parseMoney("1234.56", "USD")).toEqual(money(123456, "USD"));
    expect(parseMoney(" 0.1 ", "USD")).toEqual(money(10, "USD"));
    expect(parseMoney("12", "SEK")).toEqual(money(1200, "SEK"));
    expect(parseMoney("-50,5", "EUR")).toEqual(money(-5050, "EUR"));
    expect(parseMoney("500", "JPY")).toEqual(money(500, "JPY"));
  });

  it("reads nothing from text that isn't an amount", () => {
    expect(parseMoney("", "USD")).toBeUndefined();
    expect(parseMoney("ten", "USD")).toBeUndefined();
    expect(parseMoney("1.234", "USD")).toBeUndefined();
    expect(parseMoney("1.5", "JPY")).toBeUndefined();
  });
});
