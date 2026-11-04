import { describe, expect, it } from "vitest";
import { guessCurrency } from "./guess-currency";

describe("guessCurrency", () => {
  it.each([
    ["en-US", "USD"],
    ["sv-SE", "SEK"],
    ["en-GB", "GBP"],
    ["de-AT", "EUR"],
    ["ja-JP", "JPY"],
    // A language alone means the region it's most likely spoken in.
    ["sv", "SEK"],
    // The region decides, not the language.
    ["en-SE", "SEK"],
  ])("guesses from %s: %s", (locale, currency) => {
    expect(guessCurrency(locale)).toBe(currency);
  });

  it("falls back to US dollars for a region it doesn't know", () => {
    expect(guessCurrency("en-AQ")).toBe("USD");
  });
});
