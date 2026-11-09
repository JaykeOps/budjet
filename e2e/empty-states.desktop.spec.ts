import { expect, test } from "@playwright/test";
import { createBudget, goTo, recordRow } from "./helpers";

test("coaching says to type in the Assigned column", async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await expect(
    page.getByText(
      "Start at the top with what's due soonest. Type what Rent needs in its Assigned column.",
    ),
  ).toBeVisible();
});

test("Record a Transaction opens the Record row", async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Activity");
  await page.getByRole("button", { name: "Record a Transaction" }).click();
  await expect(recordRow(page).getByLabel("Payee")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
