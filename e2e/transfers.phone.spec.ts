import { expect, type Page, test } from "@playwright/test";
import {
  addAccount,
  createBudget,
  expectBalance,
  goTo,
  openAccount,
  toast,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

/** A Budget in USD with Checking holding $1,000 and Savings holding $500. */
async function createBudgetWithSavings(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page);
  await addAccount(page, { name: "Savings", kind: "Savings", holds: "500" });
}

test("the Transfer sheet shows both balances after and that Categories and Ready to Assign stay", async ({
  page,
}) => {
  await createBudgetWithSavings(page);
  await openAccount(page, "Checking");
  await page.getByRole("button", { name: "Transfer money" }).click();

  const sheet = page.getByRole("dialog", { name: "Transfer money" });
  await expect(sheet.getByLabel("From").locator("option:checked")).toHaveText(
    "Checking",
  );
  await expect(sheet.getByLabel("Date")).toHaveValue("2026-10-15");
  await expect(
    sheet.getByText("Your Categories and Ready to Assign don't change."),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Transfer/ })).toBeDisabled();

  await sheet.getByLabel("Amount").fill("200");
  await expect(
    sheet.getByText("Checking goes to $800.00. Savings goes to $700.00."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Transfer $200.00" }).click();

  await expect(toast(page)).toContainText("Transfer made");
  const expectMoved = async () => {
    await expectBalance(page, "Checking", "$800.00");
    await expect(
      page
        .getByRole("table", { name: "History of Checking" })
        .getByRole("row")
        .nth(1),
    ).toContainText(/To Savings.*Transfer.*−\$200\.00.*Oct 15/);
    await expectBalance(page, "Savings", "$700.00");
    await expect(
      page
        .getByRole("table", { name: "History of Savings" })
        .getByRole("row")
        .nth(1),
    ).toContainText(/From Checking.*Transfer.*\+\$200\.00/);
    await goTo(page, "Budget");
    await expect(
      page.getByRole("status", { name: "Ready to Assign" }),
    ).toHaveText(/\$1,500\.00/);
  };
  await expectMoved();
  await reloadWhenSaved(page);
  await expectMoved();
});

test("From and To are never the same Account", async ({ page }) => {
  await createBudgetWithSavings(page);
  await openAccount(page, "Checking");
  await page.getByRole("button", { name: "Transfer money" }).click();
  const sheet = page.getByRole("dialog", { name: "Transfer money" });

  await sheet.getByLabel("From").selectOption({ label: "Savings" });

  await expect(sheet.getByLabel("To").locator("option:checked")).toHaveText(
    "Checking",
  );
  await expect(sheet.getByLabel("To").getByRole("option")).toHaveCount(1);
});

test("with one Account there's nowhere to move money to, and the sheet says so", async ({
  page,
}) => {
  await createBudget(page);
  await openAccount(page, "Checking");
  await page.getByRole("button", { name: "Transfer money" }).click();
  const sheet = page.getByRole("dialog", { name: "Transfer money" });

  await sheet.getByLabel("Amount").fill("10");

  await expect(
    sheet.getByText("There's no other Account to transfer to yet."),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Transfer/ })).toBeDisabled();
});
