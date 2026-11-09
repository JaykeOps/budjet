import { expect, test } from "@playwright/test";
import { createBudget, goTo, hasRail, openApp } from "./helpers";

test("the tab and the installed app are called Crownkeep", async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle("Crownkeep");

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await page.request.get(`${href}`)).json();

  expect(manifest.name).toBe("Crownkeep");
  expect(manifest.short_name).toBe("Crownkeep");
});

test("Activity is headed Activity on a phone and All Accounts on desktop", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Activity");

  const name = hasRail(page) ? "All Accounts" : "Activity";
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 1, name, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name })).toBeVisible();
});
