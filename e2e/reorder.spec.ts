import { expect, type Locator, test } from "@playwright/test";
import {
  createBudget,
  dragTo,
  editorOutline,
  finishEditing,
  goTo,
  handleOf,
  openMore,
  startEditing,
  toast,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

const button = (scope: Locator, name: string) =>
  scope.getByRole("button", { name, exact: true });

const starter = [
  "Bills",
  "Rent",
  "Power",
  "Phone",
  "Internet",
  "Everyday",
  "Groceries",
  "Transport",
  "Dining Out",
  "Savings",
  "Emergency Fund",
];

test.beforeEach(async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await startEditing(page);
});

test("arrow keys on a handle move it, keep focus and announce where it is", async ({
  page,
}) => {
  const rent = handleOf(page, "Rent");
  await rent.focus();

  await page.keyboard.press("ArrowDown");

  await expect(toast(page)).toContainText("Rent, 2 of 4 in Bills");
  await expect(rent).toBeFocused();
  await expect
    .poll(() => editorOutline(page))
    .toEqual([
      "Bills",
      "Power",
      "Rent",
      "Phone",
      "Internet",
      ...starter.slice(5),
    ]);

  await button(toast(page), "Undo").click();
  await expect.poll(() => editorOutline(page)).toEqual(starter);
});

test("arrow keys cross Category Groups at the ends, and stop at the very top and bottom", async ({
  page,
}) => {
  const internet = handleOf(page, "Internet");
  await internet.focus();

  await page.keyboard.press("ArrowDown");

  await expect(toast(page)).toContainText("Internet, 1 of 4 in Everyday");
  await expect(internet).toBeFocused();

  await page.keyboard.press("ArrowUp");

  await expect(toast(page)).toContainText("Internet, 4 of 4 in Bills");
  await expect(internet).toBeFocused();
  await expect.poll(() => editorOutline(page)).toEqual(starter);

  const rent = handleOf(page, "Rent");
  await rent.focus();
  await page.keyboard.press("ArrowUp");
  await expect(rent).toBeFocused();
  await expect.poll(() => editorOutline(page)).toEqual(starter);
});

test("arrow keys move a Category Group", async ({ page }) => {
  const savings = handleOf(page, "Savings");
  await savings.focus();

  await page.keyboard.press("ArrowUp");

  await expect(toast(page)).toContainText("Savings, 2 of 3 Groups");
  await expect(savings).toBeFocused();
  await expect
    .poll(() => editorOutline(page))
    .toEqual([
      ...starter.slice(0, 5),
      "Savings",
      "Emergency Fund",
      "Everyday",
      "Groceries",
      "Transport",
      "Dining Out",
    ]);
});

test("⋯ moves a Category Up and Down, across Category Groups, and focus comes back after", async ({
  page,
}) => {
  const sheet = await openMore(page, "Internet");
  await expect(sheet).toContainText("4 of 4 in Bills");

  await button(sheet, "Down").click();

  await expect(sheet.getByRole("status")).toHaveText("1 of 4 in Everyday");
  await expect(button(sheet, "Down")).toBeFocused();
  await expect(
    sheet.getByLabel("Category Group").locator("option:checked"),
  ).toHaveText("Everyday");

  await button(sheet, "Up").click();
  await expect(sheet.getByRole("status")).toHaveText("4 of 4 in Bills");
  await button(sheet, "Down").click();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("button", { name: "More for Internet" }),
  ).toBeFocused();
  await expect
    .poll(() => editorOutline(page))
    .toEqual([
      "Bills",
      "Rent",
      "Power",
      "Phone",
      "Everyday",
      "Internet",
      ...starter.slice(6),
    ]);
});

test("⋯ has nowhere to go past the very top or bottom, and keeps focus", async ({
  page,
}) => {
  const sheet = await openMore(page, "Power");
  await button(sheet, "Up").click();
  await expect(sheet.getByRole("status")).toHaveText("1 of 4 in Bills");
  await expect(button(sheet, "Up")).toHaveAttribute("aria-disabled", "true");
  await expect(button(sheet, "Up")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(sheet.getByRole("status")).toHaveText("1 of 4 in Bills");
  await expect(button(sheet, "Up")).toBeFocused();
});

test("⋯'s Category Group picker moves a Category to the end of another, and a reload keeps it", async ({
  page,
}) => {
  const sheet = await openMore(page, "Rent");

  await sheet.getByLabel("Category Group").selectOption({ label: "Savings" });

  await expect(sheet.getByRole("status")).toHaveText("2 of 2 in Savings");
  await page.keyboard.press("Escape");
  const moved = [
    "Bills",
    "Power",
    "Phone",
    "Internet",
    ...starter.slice(5),
    "Rent",
  ];
  await expect.poll(() => editorOutline(page)).toEqual(moved);

  await reloadWhenSaved(page);
  await expect.poll(() => editorOutline(page)).toEqual(moved);

  await finishEditing(page);
  await expect(
    page.getByRole("meter", { name: "Spending in Rent" }),
  ).toBeVisible();
});

test("⋯ moves a Category Group Up and Down", async ({ page }) => {
  const sheet = await openMore(page, "Bills");
  await expect(sheet).toContainText("1 of 3 Groups");
  await expect(button(sheet, "Up")).toHaveAttribute("aria-disabled", "true");
  await expect(sheet.getByLabel("Category Group")).toHaveCount(0);

  await button(sheet, "Down").click();

  await expect(sheet.getByRole("status")).toHaveText("2 of 3 Groups");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => editorOutline(page))
    .toEqual([
      "Everyday",
      "Groceries",
      "Transport",
      "Dining Out",
      "Bills",
      "Rent",
      "Power",
      "Phone",
      "Internet",
      "Savings",
      "Emergency Fund",
    ]);
});

test("a handle drags by mouse within a Category Group, across them, into an empty one and for Groups", async ({
  page,
}) => {
  // Tall enough that no target sits where a drag scrolls.
  await page.setViewportSize({ width: 800, height: 1400 });
  // A Group with nothing in it, at the end.
  await page.getByRole("button", { name: "Add a Category Group" }).click();
  await page.getByRole("textbox", { name: "Add a Category Group" }).fill("Fun");
  await page.getByRole("textbox", { name: "Add a Category Group" }).blur();
  await expect.poll(() => editorOutline(page)).toEqual([...starter, "Fun"]);

  await dragTo(
    page,
    handleOf(page, "Rent"),
    page.getByRole("textbox", {
      name: "Name of Phone",
    }),
  );
  await expect(toast(page)).toContainText("Rent, 3 of 4 in Bills");
  await expect(handleOf(page, "Rent")).toBeFocused();

  await dragTo(
    page,
    handleOf(page, "Rent"),
    page.getByRole("textbox", {
      name: "Name of Transport",
    }),
  );
  await expect(toast(page)).toContainText(/Rent, [23] of 4 in Everyday/);

  await dragTo(
    page,
    handleOf(page, "Rent"),
    page.getByRole("textbox", {
      name: "Name of Fun",
    }),
  );
  await expect(toast(page)).toContainText("Rent, 1 of 1 in Fun");

  await dragTo(
    page,
    handleOf(page, "Fun"),
    page.getByRole("textbox", {
      name: "Name of Bills",
    }),
  );
  await expect(toast(page)).toContainText("Fun, 1 of 4 Groups");
  await expect
    .poll(async () => (await editorOutline(page)).slice(0, 3))
    .toEqual(["Fun", "Rent", "Bills"]);

  await reloadWhenSaved(page);
  await expect
    .poll(async () => (await editorOutline(page)).slice(0, 3))
    .toEqual(["Fun", "Rent", "Bills"]);
});

test("a drag writes one move, whatever it passes over", async ({ page }) => {
  await dragTo(
    page,
    handleOf(page, "Rent"),
    page.getByRole("textbox", {
      name: "Name of Internet",
    }),
  );

  await button(toast(page), "Undo").click();

  await expect.poll(() => editorOutline(page)).toEqual(starter);
});
