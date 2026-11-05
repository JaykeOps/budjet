import { expect, test } from "@playwright/test";
import { createBudget, goTo } from "./helpers";

test("coaching says to type in the Assigned column", async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await expect(
    page.getByText(
      "Start at the top with what's due soonest. Type what Rent needs in its Assigned column.",
    ),
  ).toBeVisible();
});
