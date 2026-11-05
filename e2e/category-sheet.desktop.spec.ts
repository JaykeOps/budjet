import { expect, test } from "@playwright/test";
import { createBudget, goTo, openCategory } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
});

test("a side panel fills the height of the window, against its right edge", async ({
  page,
}) => {
  const sheet = await openCategory(page, "Rent");
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  const window = page.viewportSize();
  expect(box?.height).toBe(window?.height);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(window?.width);
});

test("‹ › step at the top, and ↑ ↓ from the field", async ({ page }) => {
  const sheet = await openCategory(page, "Rent");
  const back = sheet.getByRole("button", { name: "Previous Category" });
  const on = (step: number) =>
    sheet.getByText(new RegExp(`· ${step} of \\d+$`));
  await expect(back).toBeDisabled();

  await sheet.getByRole("button", { name: "Skip to next Category" }).click();
  await expect(on(2)).toBeVisible();
  await back.click();
  await expect(on(1)).toBeVisible();

  const field = sheet.getByRole("textbox", { name: "Assigned in October" });
  await field.press("ArrowDown");
  await expect(on(2)).toBeVisible();
  await field.press("ArrowUp");
  await expect(on(1)).toBeVisible();
});

test("Escape closes the panel and returns focus to the Category", async ({
  page,
}) => {
  const sheet = await openCategory(page, "Rent");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Rent", exact: true }),
  ).toBeFocused();
});
