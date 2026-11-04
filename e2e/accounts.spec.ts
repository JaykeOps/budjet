import { expect, type Page, test } from "@playwright/test";
import { createBudget, goTo } from "./helpers";
import { reloadWhenSaved } from "./reload";

async function createBudgetWithFirstAccount(page: Page) {
  await createBudget(page, {
    firstAccount: {
      name: "Everyday checking",
      type: "checking",
      openingBalance: "1250.50",
    },
  });
  await goTo(page, "Accounts");
}

test("a user adds more Accounts and sees each balance and the total", async ({
  page,
}) => {
  await createBudgetWithFirstAccount(page);
  const accounts = page.getByRole("table", { name: "Accounts" });
  await expect(
    accounts.getByRole("row", { name: /Everyday checking/ }),
  ).toContainText("$1,250.50");

  const add = page.getByRole("form", { name: "Add an Account" });
  await add.getByLabel("Name").fill("Rainy day");
  await add.getByLabel("Type").selectOption("savings");
  await add.getByLabel("Opening Balance").fill("3000");
  await add.getByRole("button", { name: "Add Account" }).click();

  await add.getByLabel("Name").fill("Wallet");
  await add.getByLabel("Type").selectOption("cash");
  await add.getByLabel("Opening Balance").fill("40.25");
  await add.getByRole("button", { name: "Add Account" }).click();

  const expectAccounts = async () => {
    await expect(
      accounts.getByRole("row", { name: /Rainy day/ }),
    ).toContainText("$3,000.00");
    await expect(accounts.getByRole("row", { name: /Wallet/ })).toContainText(
      "$40.25",
    );
    await expect(accounts.getByRole("row", { name: /Total/ })).toContainText(
      "$4,290.75",
    );
  };
  await expectAccounts();

  await reloadWhenSaved(page);

  await expectAccounts();
});

test("an Opening Balance that isn't an amount is refused", async ({ page }) => {
  await createBudgetWithFirstAccount(page);

  const add = page.getByRole("form", { name: "Add an Account" });
  await add.getByLabel("Name").fill("Savings");
  await add.getByLabel("Opening Balance").fill("lots");
  await add.getByRole("button", { name: "Add Account" }).click();

  await expect(add.getByRole("alert")).toContainText("isn't an amount");
  await expect(
    page.getByRole("table", { name: "Accounts" }).getByRole("row", {
      name: /Savings/,
    }),
  ).toBeHidden();
});

test("a user confirms a balance matches the bank, which moves no money and is kept in the history", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudgetWithFirstAccount(page);
  const row = page
    .getByRole("table", { name: "Accounts" })
    .getByRole("row", { name: /Everyday checking/ });
  await expect(row).toContainText("Not checked yet");
  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await goTo(page, "Budget");
  await expect(readyToAssign).toHaveText(/\$1,250\.50/);

  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00"));
  await goTo(page, "Accounts");
  const redeclare = page.getByRole("form", { name: "Re-declare a balance" });
  await redeclare.getByLabel("Balance").fill("1250.50");
  await redeclare.getByRole("button", { name: "Re-declare Balance" }).click();

  const expectChecked = async () => {
    await goTo(page, "Accounts");
    await expect(row).toContainText("2026-10-18");
    await expect(row).not.toContainText("Not checked yet");
    await goTo(page, "Budget");
    await expect(readyToAssign).toHaveText(/\$1,250\.50/);
    await goTo(page, "Activity");
    const check = page
      .getByRole("table", { name: "Transactions in Everyday checking" })
      .getByRole("row", { name: /Balance checked/ });
    await expect(check).toContainText("2026-10-18");
    await expect(check).toContainText("Matched your bank at $1,250.50");
    await expect(check).not.toContainText("Ready to Assign");
  };
  await expectChecked();

  await reloadWhenSaved(page);

  await expectChecked();
});

test("a user re-declares a balance, Transfers an Account to $0, closes it and renames another", async ({
  page,
}) => {
  await createBudgetWithFirstAccount(page);
  const add = page.getByRole("form", { name: "Add an Account" });
  await add.getByLabel("Name").fill("Rainy day");
  await add.getByLabel("Type").selectOption("savings");
  await add.getByLabel("Opening Balance").fill("3000");
  await add.getByRole("button", { name: "Add Account" }).click();
  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await goTo(page, "Budget");
  await expect(readyToAssign).toHaveText(/\$4,250\.50/);
  await goTo(page, "Accounts");
  const accounts = page.getByRole("table", { name: "Accounts" });
  const accountsRegion = page.getByRole("region", { name: "Accounts" });

  const redeclare = page.getByRole("form", { name: "Re-declare a balance" });
  await redeclare.getByLabel("Account").selectOption({
    label: "Everyday checking",
  });
  await redeclare.getByLabel("Balance").fill("1300");
  await redeclare.getByRole("button", { name: "Re-declare Balance" }).click();
  await expect(
    accounts.getByRole("row", { name: /Everyday checking/ }),
  ).toContainText("$1,300.00");
  await goTo(page, "Budget");
  await expect(readyToAssign).toHaveText(/\$4,300\.00/);
  await goTo(page, "Activity");
  // The Account's history explains the new balance, and it can't be edited.
  const adjustment = page
    .getByRole("table", { name: "Transactions in Everyday checking" })
    .getByRole("row", { name: /Balance adjustment/ });
  await expect(adjustment).toContainText(/Ready to Assign.*\$49\.50/);
  await expect(adjustment.getByRole("button")).toHaveCount(0);

  await goTo(page, "Accounts");
  await accounts.getByRole("button", { name: "Close Rainy day" }).click();
  await expect(accountsRegion.getByRole("alert")).toContainText(
    "Transfer the $3,000.00 in Rainy day to another Account first",
  );

  const transfer = page.getByRole("form", { name: "Make a Transfer" });
  await transfer.getByLabel("From").selectOption({ label: "Rainy day" });
  await transfer.getByLabel("To").selectOption({ label: "Everyday checking" });
  await transfer.getByLabel("Amount").fill("3000");
  await transfer.getByRole("button", { name: "Make Transfer" }).click();
  await accounts.getByRole("button", { name: "Close Rainy day" }).click();
  await expect(accountsRegion.getByRole("alert")).toBeHidden();

  const rename = page.getByRole("form", { name: "Rename an Account" });
  await rename.getByLabel("Account").selectOption({
    label: "Everyday checking",
  });
  await rename.getByLabel("New name").fill("Bills");
  await rename.getByRole("button", { name: "Rename Account" }).click();

  const expectClosed = async () => {
    await goTo(page, "Accounts");
    await expect(
      accounts.getByRole("row", { name: /Rainy day \(closed\)/ }),
    ).toContainText("$0.00");
    await expect(
      accounts.getByRole("button", { name: "Close Rainy day" }),
    ).toBeHidden();
    await expect(accounts.getByRole("row", { name: /Bills/ })).toContainText(
      "$4,300.00",
    );
    await goTo(page, "Budget");
    await expect(readyToAssign).toHaveText(/\$4,300\.00/);
    await goTo(page, "Activity");
    // Its history stays, but it takes no new Transactions or Transfers.
    const transactions = page.getByRole("region", {
      name: "Transactions",
      exact: true,
    });
    await transactions
      .getByRole("combobox", { name: /^Account/ })
      .selectOption({ label: "Rainy day (closed)" });
    await expect(
      page
        .getByRole("table", { name: "Transactions in Rainy day" })
        .getByRole("row")
        .nth(1),
    ).toContainText(/Transfer to Bills.*−\$3,000\.00/);
    await expect(
      transactions.getByRole("form", { name: "Record a Transaction" }),
    ).toBeHidden();
    await expect(page.getByRole("region", { name: "Transfers" })).toBeHidden();
  };
  await expectClosed();

  await reloadWhenSaved(page);

  await expectClosed();
});
