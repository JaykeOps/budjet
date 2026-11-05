import { describe, expect, it } from "vitest";
import { money } from "../../kernel/money";
import { type CoverCandidate, coveringSource } from "./covering-source";

const usd = (dollars: number) => money(Math.round(dollars * 100), "USD");

function candidate(
  id: string,
  groupId: string,
  assigned: number,
  available: number,
): CoverCandidate {
  return { id, groupId, assigned: usd(assigned), available: usd(available) };
}

const dining = { id: "dining", groupId: "everyday" };

describe("coveringSource", () => {
  it("prefers the same Category Group, when this Month's Assignment covers the whole amount", () => {
    const source = coveringSource(
      [
        candidate("rent", "bills", 500, 500),
        candidate("groceries", "everyday", 30, 30),
      ],
      dining,
      usd(20),
    );
    expect(source).toBe("groceries");
  });

  it("takes the most Available within the same Category Group", () => {
    const source = coveringSource(
      [
        candidate("groceries", "everyday", 30, 30),
        candidate("transport", "everyday", 50, 50),
      ],
      dining,
      usd(20),
    );
    expect(source).toBe("transport");
  });

  it("goes to another Category Group when nothing in this one covers it from its Assignment", () => {
    const source = coveringSource(
      [
        candidate("groceries", "everyday", 10, 10),
        candidate("power", "bills", 30, 30),
        candidate("rent", "bills", 50, 50),
      ],
      dining,
      usd(20),
    );
    expect(source).toBe("rent");
  });

  it("counts only what the Assignment can give without leaving the Category Overspent", () => {
    const source = coveringSource(
      [
        // Assigned $100.00, but only $5.00 of it is left.
        candidate("groceries", "everyday", 100, 5),
        candidate("rent", "bills", 25, 25),
      ],
      dining,
      usd(20),
    );
    expect(source).toBe("rent");
  });

  it("falls back to one needing a Take-back, most Available first, ahead of its own Group", () => {
    const source = coveringSource(
      [
        candidate("groceries", "everyday", 0, 30),
        candidate("holiday", "savings", 0, 600),
        candidate("power", "bills", 5, 10),
      ],
      dining,
      usd(20),
    );
    expect(source).toBe("holiday");
  });

  it("takes whatever can give the most when nothing covers the whole amount", () => {
    const source = coveringSource(
      [
        candidate("groceries", "everyday", 5, 5),
        candidate("power", "bills", 0, 15),
        candidate("rent", "bills", 10, 10),
      ],
      dining,
      usd(20),
    );
    expect(source).toBe("power");
  });

  it("never suggests the Category itself, or one with nothing to give", () => {
    const candidates = [
      candidate("dining", "everyday", 500, 500),
      candidate("groceries", "everyday", 0, 0),
      candidate("rent", "bills", 0, -40),
    ];
    expect(coveringSource(candidates, dining, usd(20))).toBeUndefined();
  });
});
