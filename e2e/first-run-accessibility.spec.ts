import { expect, type Page, test } from "@playwright/test";
import { violationsInEachTheme } from "./axe";
import { openApp } from "./helpers";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const heading = (page: Page, name: string) =>
  page.getByRole("heading", { name, level: 1 });
const NONE = { light: [], dark: [] };

test("every first-run step has no accessibility violations in either theme", async ({
  page,
}) => {
  await openApp(page);
  await expect(heading(page, "Give every dollar a job.")).toBeVisible();
  expect(await violationsInEachTheme(page)).toEqual(NONE);

  await button(page, "Get started").click();
  await expect(heading(page, "Where should your Budget live?")).toBeVisible();
  expect(await violationsInEachTheme(page)).toEqual(NONE);

  await button(page, "Choose a folder").click();
  await button(page, "Start a new Budget").click();
  await expect(heading(page, "What currency is your Budget in?")).toBeVisible();
  expect(await violationsInEachTheme(page)).toEqual(NONE);

  await button(page, "Next").click();
  await expect(heading(page, "Start with some Categories?")).toBeVisible();
  await expect(button(page, "Use the starter set")).toHaveAccessibleDescription(
    /Rent, Power/,
  );
  await expect(button(page, "Start blank")).toHaveAccessibleDescription(
    "You'll add your own on the Budget screen.",
  );
  expect(await violationsInEachTheme(page)).toEqual(NONE);

  await button(page, "Use the starter set").click();
  await expect(heading(page, "Where's your money now?")).toBeVisible();
  expect(await violationsInEachTheme(page)).toEqual(NONE);

  await page.getByLabel("Name").fill("Checking");
  await page.getByLabel("What it holds today").fill("1000");
  await button(page, "Add Account").click();
  await expect(button(page, "Open my Budget")).toBeVisible();
  expect(await violationsInEachTheme(page)).toEqual(NONE);
});
