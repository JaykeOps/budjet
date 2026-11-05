import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createBudget, goTo, openAccount } from "./helpers";

test("the Accounts tab with none open offers Add an Account, above the closed ones", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "0" } });
  await openAccount(page, "Checking");
  await page.getByRole("button", { name: "More for Checking" }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Checking" }).click();
  await goTo(page, "Accounts");

  await expect(
    page.getByText(
      "No Accounts yet. An Account is somewhere you keep money you could spend soon: checking, savings or cash.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Closed Accounts (1)")).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Money in your Accounts" }),
  ).toBeHidden();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "Add an Account" }).click();
  await expect(page.getByRole("dialog", { name: "Add Account" })).toBeVisible();
});

test("coaching says to tap the first Category", async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Budget");
  await expect(
    page.getByText(
      "Start at the top with what's due soonest. Tap Rent and give it what it needs.",
    ),
  ).toBeVisible();
});

test("Record a Transaction opens the recording sheet", async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Activity");
  await page.getByRole("button", { name: "Record a Transaction" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
