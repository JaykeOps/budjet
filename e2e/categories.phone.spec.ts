import { expect, test } from "@playwright/test";
import { createBudget, goTo, startEditing } from "./helpers";

test("Edit on a phone shows only the list", async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Budget");

  await startEditing(page);

  await expect(page.getByText("Ready to Assign")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Spent this Month" }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Bills" })).toBeVisible();
});
