import { expect, test } from "@playwright/test";
import { addAccount, createBudget, expectBalance, goTo, show } from "./helpers";
import { reloadWhenSaved } from "./reload";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

test("the form starts on today", async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Activity");

  await expect(
    page.getByRole("form", { name: "Record a Transaction" }).getByLabel("Date"),
  ).toHaveValue("2026-10-15");
});

test("money going out without a Category is refused", async ({ page }) => {
  await createBudget(page);

  await goTo(page, "Activity");
  const record = page.getByRole("form", { name: "Record a Transaction" });
  await record.getByLabel("Amount").fill("20");
  await record.getByRole("button", { name: "Record Transaction" }).click();

  await expect(record.getByRole("alert")).toContainText("needs a Category");
  await expectBalance(page, "Checking", "$1,000.00");
});

test("a Transaction is recorded in the Account chosen, starting on the one showing", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await goTo(page, "Activity");
  const record = page.getByRole("form", { name: "Record a Transaction" });
  await expect(record.getByLabel("Account")).toHaveValue(/.+/);
  await record.getByLabel("Account").selectOption({ label: "Savings" });
  await record.getByLabel("Money").selectOption("in");
  await record.getByLabel("Amount").fill("20");
  await record.getByLabel("Payee").fill("Interest");
  await record.getByRole("button", { name: "Record Transaction" }).click();
  await expect(
    page
      .getByRole("table", { name: "History of All Accounts" })
      .getByRole("row", { name: /Interest/ }),
  ).toContainText("Ready to Assign, Savings");

  await show(page, { account: "Savings" });

  await expect(
    record.getByLabel("Account").locator("option:checked"),
  ).toHaveText("Savings");
});

test("Payees used before are suggested", async ({ page }) => {
  await createBudget(page);
  await goTo(page, "Activity");
  const record = page.getByRole("form", { name: "Record a Transaction" });
  await record.getByLabel("Money").selectOption("in");
  await record.getByLabel("Amount").fill("2000");
  await record.getByLabel("Payee").fill("Employer");
  await record.getByRole("button", { name: "Record Transaction" }).click();
  await expect(
    page
      .getByRole("table", { name: "History of All Accounts" })
      .getByRole("row", { name: /Employer/ }),
  ).toBeVisible();

  await reloadWhenSaved(page);

  const list = await record.getByLabel("Payee").getAttribute("list");
  const suggestions = page.locator(`datalist[id="${list}"] option`);
  await expect(suggestions).toHaveCount(1);
  await expect(suggestions).toHaveAttribute("value", "Employer");
});
