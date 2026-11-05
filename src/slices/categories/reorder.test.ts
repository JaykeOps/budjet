import { describe, expect, it } from "vitest";
import type { CategoryGroup } from "./queries";
import {
  categoryPlace,
  categoryStep,
  groupPlace,
  groupStep,
  withCategoryAt,
  withGroupAt,
} from "./reorder";

function group(id: string, ...categoryIds: string[]): CategoryGroup {
  return {
    id,
    name: id,
    hidden: false,
    leftOutOfSpentThisMonth: false,
    categories: categoryIds.map((category) => ({
      id: category,
      name: category,
      hidden: false,
    })),
  };
}

const groups = [
  group("Bills", "Rent", "Power"),
  group("Empty"),
  group("Everyday", "Groceries", "Transport"),
];

const outline = (shown: CategoryGroup[]) =>
  shown.map(({ id, categories }) => [id, categories.map((c) => c.id)]);

describe("a step of a Category", () => {
  it("moves within its Category Group", () => {
    expect(categoryStep(groups, "Rent", 1)).toEqual({
      groupId: "Bills",
      toIndex: 1,
    });
    expect(categoryStep(groups, "Transport", -1)).toEqual({
      groupId: "Everyday",
      toIndex: 0,
    });
  });

  it("crosses to the top of the next Category Group from the bottom", () => {
    expect(categoryStep(groups, "Power", 1)).toEqual({
      groupId: "Empty",
      toIndex: 0,
    });
  });

  it("crosses to the bottom of the previous Category Group from the top", () => {
    expect(
      categoryStep(groups.slice(0, 1).concat(groups[2]), "Groceries", -1),
    ).toEqual({ groupId: "Bills", toIndex: 2 });
  });

  it("has nowhere to go past the first or last place", () => {
    expect(categoryStep(groups, "Rent", -1)).toBeUndefined();
    expect(categoryStep(groups, "Transport", 1)).toBeUndefined();
  });
});

describe("a step of a Category Group", () => {
  it("moves among the Category Groups, and stops at the ends", () => {
    expect(groupStep(groups, "Empty", -1)).toBe(0);
    expect(groupStep(groups, "Empty", 1)).toBe(2);
    expect(groupStep(groups, "Bills", -1)).toBeUndefined();
    expect(groupStep(groups, "Everyday", 1)).toBeUndefined();
  });
});

describe("where something is, in words", () => {
  it("counts a Category among its Category Group's", () => {
    expect(categoryPlace(groups, "Power")).toBe("2 of 2 in Bills");
  });

  it("counts a Category Group among the Category Groups", () => {
    expect(groupPlace(groups, "Empty")).toBe("2 of 3 Groups");
  });
});

describe("how the list looks mid-drag", () => {
  it("shows a Category in another Category Group", () => {
    expect(
      outline(
        withCategoryAt(groups, "Rent", { groupId: "Everyday", toIndex: 1 }),
      ),
    ).toEqual([
      ["Bills", ["Power"]],
      ["Empty", []],
      ["Everyday", ["Groceries", "Rent", "Transport"]],
    ]);
  });

  it("shows a Category in an empty Category Group", () => {
    expect(
      outline(
        withCategoryAt(groups, "Power", { groupId: "Empty", toIndex: 0 }),
      ),
    ).toEqual([
      ["Bills", ["Rent"]],
      ["Empty", ["Power"]],
      ["Everyday", ["Groceries", "Transport"]],
    ]);
  });

  it("shows a Category Group elsewhere", () => {
    expect(outline(withGroupAt(groups, "Bills", 2)).map(([id]) => id)).toEqual([
      "Empty",
      "Everyday",
      "Bills",
    ]);
  });
});
