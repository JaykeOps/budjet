import { expect, test } from "@playwright/test";
import { createBudget, goTo } from "./helpers";

test("a phone has tabs for Budget, Activity, (+) and Accounts, and no rail", async ({
  page,
}) => {
  await createBudget(page);
  const tabs = page
    .getByRole("navigation", { name: "Places" })
    .getByRole("link");

  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toHaveAccessibleName("Budget");
  await expect(tabs.nth(1)).toHaveAccessibleName("Activity");
  await expect(tabs.nth(2)).toHaveAccessibleName("Record");
  await expect(tabs.nth(3)).toHaveAccessibleName("Accounts");
  await expect(tabs.nth(0)).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /All Accounts/ })).toBeHidden();
});

test("(+) stands in for recording by opening the Record a Transaction form", async ({
  page,
}) => {
  await createBudget(page);

  await page.getByRole("link", { name: "Record" }).click();

  await expect(
    page.getByRole("form", { name: "Record a Transaction" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Places" })
      .getByRole("link", { name: "Activity" }),
  ).toHaveAttribute("aria-current", "page");
});

test("the tab bar stays reachable at the bottom of a long screen", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await expect(
    page.getByRole("link", { name: "Accounts", exact: true }),
  ).toBeInViewport();
  await expect(page.getByText(/^Version /)).toBeInViewport();
});
