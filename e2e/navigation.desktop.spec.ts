import { expect, type Page, test } from "@playwright/test";
import { addAccount, createBudget } from "./helpers";

function rail(page: Page) {
  return page.getByRole("navigation", { name: "Places" });
}

test("the rail has Record, Budget, All Accounts with the total, each open Account with its balance, and + Add Account", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });

  const links = rail(page).getByRole("link");
  await expect(links).toHaveCount(5);
  await expect(links.nth(0)).toHaveAccessibleName("Record");
  await expect(links.nth(1)).toHaveAccessibleName("Budget");
  await expect(links.nth(2)).toHaveAccessibleName("All Accounts $1,500.00");
  await expect(links.nth(3)).toHaveAccessibleName("Checking $1,000.00");
  await expect(links.nth(4)).toHaveAccessibleName("Savings $500.00");
  await expect(
    rail(page).getByRole("button", { name: "+ Add Account" }),
  ).toBeVisible();
});

test("an Account in the rail opens that Account's page", async ({ page }) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });

  const savings = rail(page).getByRole("link", { name: /^Savings/ });
  await savings.click();

  await expect(
    page.getByRole("table", { name: "History of Savings" }),
  ).toBeVisible();
  await expect(savings).toHaveAttribute("aria-current", "page");
  await expect(
    rail(page).getByRole("link", { name: /^All Accounts/ }),
  ).not.toHaveAttribute("aria-current", "page");
});

test("closed Accounts fold away behind a Closed toggle that shows how many", async ({
  page,
}) => {
  await createBudget(page);
  const toggle = rail(page).getByRole("button", { name: /^Closed/ });
  await expect(toggle).toBeHidden();

  await addAccount(page, { name: "Old" });
  const old = rail(page).getByRole("link", { name: /^Old/ });
  await expect(old).toBeVisible();
  await page.getByRole("button", { name: /^More for Old/ }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Old" }).click();

  await expect(old).toBeHidden();
  await expect(toggle).toHaveAccessibleName("Closed (1)");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await old.click();
  await expect(
    page.getByRole("table", { name: "History of Old" }),
  ).toBeVisible();

  await toggle.click();
  await expect(old).toBeHidden();
});

test("Record stands in for recording by opening the Record a Transaction form", async ({
  page,
}) => {
  await createBudget(page);

  await rail(page).getByRole("link", { name: "Record" }).click();

  await expect(
    page.getByRole("form", { name: "Record a Transaction" }),
  ).toBeVisible();
});

test("Activity on a phone and All Accounts on desktop are the same place", async ({
  page,
}) => {
  await createBudget(page);
  await page.setViewportSize({ width: 412, height: 839 });
  const places = rail(page);
  await places.getByRole("link", { name: "Activity" }).click();
  const history = page.getByRole("table", { name: "History of All Accounts" });
  await expect(page.getByRole("region", { name: "Activity" })).toBeVisible();
  await expect(history).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 720 });

  await expect(
    page.getByRole("region", { name: "All Accounts" }),
  ).toBeVisible();
  await expect(history).toBeVisible();
  await expect(
    places.getByRole("link", { name: /^All Accounts/ }),
  ).toHaveAttribute("aria-current", "page");
});
