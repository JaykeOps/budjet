import { expect, type Page, test } from "@playwright/test";
import { reloadWhenSaved } from "./reload";

async function createBudget(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill("1000");
  await setup.getByRole("button", { name: "Add Account" }).click();
}

test("a user records spending and income and sees Available, Ready to Assign and the Account balance change", async ({
  page,
}) => {
  await createBudget(page);
  const groceriesAssignment = page.getByLabel("Assignment for Groceries");
  await groceriesAssignment.fill("400");
  await groceriesAssignment.press("Enter");

  const record = page.getByRole("form", { name: "Record a Transaction" });
  await expect(record.getByLabel("Date")).toHaveValue("2026-10-15");
  await record.getByLabel("Amount").fill("45.50");
  await record.getByLabel("Category").selectOption({ label: "Groceries" });
  await record.getByLabel("Payee").fill("Corner Shop");
  await record.getByLabel("Memo").fill("Milk and bread");
  await record.getByRole("button", { name: "Record Transaction" }).click();

  await record.getByLabel("Date").fill("2026-10-01");
  await record.getByLabel("Money").selectOption("in");
  await record.getByLabel("Amount").fill("2000");
  await record.getByLabel("Payee").fill("Employer");
  await record.getByRole("button", { name: "Record Transaction" }).click();

  const expectRecorded = async () => {
    const groceries = page
      .getByRole("table", { name: "October 2026" })
      .getByRole("row", { name: /Groceries/ });
    await expect(groceries).toContainText("$45.50");
    await expect(groceries).toContainText("$354.50");
    await expect(
      page.getByRole("status", { name: "Ready to Assign" }),
    ).toHaveText(/\$2,600\.00/);
    await expect(
      page
        .getByRole("table", { name: "Accounts" })
        .getByRole("row", { name: /Checking/ }),
    ).toContainText("$2,954.50");

    const transactions = page.getByRole("table", {
      name: "Transactions in Checking",
    });
    await expect(transactions.getByRole("row")).toHaveCount(3);
    await expect(transactions.getByRole("row").nth(1)).toContainText(
      /Corner Shop.*Groceries.*Milk and bread.*-\$45\.50/,
    );
    await expect(transactions.getByRole("row").nth(2)).toContainText(
      /Employer.*Ready to Assign.*\$2,000\.00/,
    );
  };
  await expectRecorded();

  await reloadWhenSaved(page);

  await expectRecorded();
});

test("money going out without a Category is refused", async ({ page }) => {
  await createBudget(page);

  const record = page.getByRole("form", { name: "Record a Transaction" });
  await record.getByLabel("Amount").fill("20");
  await record.getByRole("button", { name: "Record Transaction" }).click();

  await expect(record.getByRole("alert")).toContainText("needs a Category");
  await expect(
    page
      .getByRole("table", { name: "Accounts" })
      .getByRole("row", { name: /Checking/ }),
  ).toContainText("$1,000.00");
});
