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

test("Geist is served from the precache when offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "budjet" })).toBeVisible();

  const faces = await page.evaluate(async () => {
    const loaded = await document.fonts.load("16px 'Geist Variable'");
    return loaded.map(({ status }) => status);
  });
  expect(faces).toContain("loaded");
});
