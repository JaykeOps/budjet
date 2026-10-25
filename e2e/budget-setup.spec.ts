import { expect, test } from "@playwright/test";

// Saving the Budget comes with the next ticket; then this journey ends with a reload.
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
});
