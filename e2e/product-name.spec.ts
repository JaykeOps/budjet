import { expect, test } from "@playwright/test";
import { createBudget, goTo, openApp } from "./helpers";

test("the tab and the installed app are called Crownkeep", async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle("Crownkeep");

  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await page.request.get(`${href}`)).json();

  expect(manifest.name).toBe("Crownkeep");
  expect(manifest.short_name).toBe("Crownkeep");
});

test("a screen with no heading of its own is headed Crownkeep", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Activity");

  await expect(
    page.getByRole("heading", { level: 1, name: "Crownkeep" }),
  ).toBeVisible();
});
