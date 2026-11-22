import { describe, expect, it } from "vitest";
import { asId, type CategoryGroupId, type CategoryId } from "../../kernel/id";
import type { CategoryGroup } from "./queries";
import {
  categoryPlace,
  categoryStep,
  groupPlace,
  groupStep,
  withCategoryAt,
  withGroupAt,
} from "./reorder";

const bills = asId<CategoryGroupId>("Bills");
const empty = asId<CategoryGroupId>("Empty");
const everyday = asId<CategoryGroupId>("Everyday");

const groceries = asId<CategoryId>("Groceries");
const power = asId<CategoryId>("Power");
const rent = asId<CategoryId>("Rent");
const transport = asId<CategoryId>("Transport");

function group(id: string, ...categoryIds: string[]): CategoryGroup {
  return {
    id: asId<CategoryGroupId>(id),
    name: id,
    leftOutOfSpentThisMonth: false,
    categories: categoryIds.map((category) => ({
      id: asId<CategoryId>(category),
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
    expect(categoryStep(groups, rent, 1)).toEqual({
      groupId: bills,
      toIndex: 1,
    });
    expect(categoryStep(groups, transport, -1)).toEqual({
      groupId: everyday,
      toIndex: 0,
    });
  });

  it("crosses to the top of the next Category Group from the bottom", () => {
    expect(categoryStep(groups, power, 1)).toEqual({
      groupId: empty,
      toIndex: 0,
    });
  });

  it("crosses to the bottom of the previous Category Group from the top", () => {
    expect(
      categoryStep(groups.slice(0, 1).concat(groups[2]), groceries, -1),
    ).toEqual({ groupId: bills, toIndex: 2 });
  });

  it("has nowhere to go past the first or last place", () => {
    expect(categoryStep(groups, rent, -1)).toBeUndefined();
    expect(categoryStep(groups, transport, 1)).toBeUndefined();
  });
});

describe("a step of a Category Group", () => {
  it("moves among the Category Groups, and stops at the ends", () => {
    expect(groupStep(groups, empty, -1)).toBe(0);
    expect(groupStep(groups, empty, 1)).toBe(2);
    expect(groupStep(groups, bills, -1)).toBeUndefined();
    expect(groupStep(groups, everyday, 1)).toBeUndefined();
  });
});

describe("where something is, in words", () => {
  it("counts a Category among its Category Group's", () => {
    expect(categoryPlace(groups, power)).toBe("2 of 2 in Bills");
  });

  it("counts a Category Group among the Category Groups", () => {
    expect(groupPlace(groups, empty)).toBe("2 of 3 Groups");
  });
});

describe("how the list looks mid-drag", () => {
  it("shows a Category in another Category Group", () => {
    expect(
      outline(
        withCategoryAt(groups, rent, {
          groupId: everyday,
          toIndex: 1,
        }),
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
        withCategoryAt(groups, power, {
          groupId: empty,
          toIndex: 0,
        }),
      ),
    ).toEqual([
      ["Bills", ["Rent"]],
      ["Empty", ["Power"]],
      ["Everyday", ["Groceries", "Transport"]],
    ]);
  });

  it("shows a Category Group elsewhere", () => {
    expect(outline(withGroupAt(groups, bills, 2)).map(([id]) => id)).toEqual([
      "Empty",
      "Everyday",
      "Bills",
    ]);
  });
});
