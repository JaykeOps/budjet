import { expect, test } from "@playwright/test";

test("app still loads offline after the first visit", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "budjet" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole("heading", { name: "budjet" })).toBeVisible();
});
