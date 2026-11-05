import { expect, type Locator, type Page, test } from "@playwright/test";
import { assign, createBudget, goTo, openMore, startEditing } from "./helpers";

const button = (scope: Page | Locator, name: string) =>
  scope.getByRole("button", { name, exact: true });

test("hiding a Category speaks the Budget's currency", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, { currency: "EUR" });
  await goTo(page, "Budget");
  await button(page, "Next Month").click();
  await assign(page, "Rent", "30");

  await startEditing(page);
  const sheet = await openMore(page, "Rent");
  await button(sheet, "Hide Rent").click();

  await expect(sheet).toContainText("Hiding sets that to €0.00");
  await expect(button(sheet, "Set to €0.00 and hide")).toBeVisible();
  await expect(sheet).not.toContainText("$");
});
