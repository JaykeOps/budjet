import { expect, test } from "@playwright/test";
import { createBudget, goTo } from "./helpers";

test("a phone has tabs for Budget, Activity, (+) and Accounts, and no rail", async ({
  page,
}) => {
  await createBudget(page);
  const places = page.getByRole("navigation", { name: "Places" });
  const tabs = places.getByRole("link").or(places.getByRole("button"));

  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toHaveAccessibleName("Budget");
  await expect(tabs.nth(1)).toHaveAccessibleName("Activity");
  await expect(tabs.nth(2)).toHaveAccessibleName("Record");
  await expect(tabs.nth(3)).toHaveAccessibleName("Accounts");
  await expect(tabs.nth(0)).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /All Accounts/ })).toBeHidden();
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
