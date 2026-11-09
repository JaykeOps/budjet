import { expect, test } from "@playwright/test";
import { SUBPATH_ADDRESS } from "../playwright.config";

// GitHub Pages serves the build at /budjet/, and every other spec runs at the root.
const welcome = "Give every dollar a job.";

test("a build served under a subpath loads and installs from there", async ({
  page,
  context,
}) => {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });

  await page.goto(SUBPATH_ADDRESS);
  await expect(page.getByRole("heading", { name: welcome })).toBeVisible();

  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  expect(scope).toBe(SUBPATH_ADDRESS);

  const manifest = page.locator('link[rel="manifest"]');
  const manifestUrl = new URL(
    `${await manifest.getAttribute("href")}`,
    SUBPATH_ADDRESS,
  );
  const { start_url, scope: manifestScope } = await (
    await page.request.get(manifestUrl.href)
  ).json();
  expect(new URL(start_url, manifestUrl).href).toBe(SUBPATH_ADDRESS);
  expect(new URL(manifestScope, manifestUrl).href).toBe(SUBPATH_ADDRESS);

  await context.setOffline(true);
  await page.goto(`${SUBPATH_ADDRESS}?place=activity`);
  await expect(page.getByRole("heading", { name: welcome })).toBeVisible();
  const faces = await page.evaluate(async () => {
    const loaded = await document.fonts.load("16px 'Geist Variable'");
    return loaded.map(({ status }) => status);
  });
  expect(faces).toContain("loaded");

  expect(failures).toEqual([]);
});
