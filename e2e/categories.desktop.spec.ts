import { expect, test } from "@playwright/test";
import { createBudget, goTo, startEditing } from "./helpers";

test("Edit on desktop keeps the Ready to Assign card beside the list", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");

  await startEditing(page);

  await expect(
    page.getByRole("status", { name: "Ready to Assign" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Spent this Month" }),
  ).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Bills" })).toBeVisible();
});
