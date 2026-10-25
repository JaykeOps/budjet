import { expect, test } from "@playwright/test";

test("a first-time user creates a Budget in their currency", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeVisible();

  await page.getByLabel("Currency").selectOption("SEK");
  await page.getByRole("button", { name: "Create Budget" }).click();

  await expect(
    page.getByRole("heading", { name: "Budget", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Kept in SEK")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeHidden();

  await page.reload();

  await expect(page.getByText("Kept in SEK")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeHidden();
});

test("a returning user's Budget opens with the network offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByLabel("Currency").selectOption("EUR");
  await page.getByRole("button", { name: "Create Budget" }).click();
  await expect(page.getByText("Kept in EUR")).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText("Kept in EUR")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeHidden();
});
