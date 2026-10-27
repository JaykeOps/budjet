import { expect, type Page, test } from "@playwright/test";
import { reloadWhenSaved } from "./reload";

async function createBudgetWithFirstAccount(page: Page) {
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();

  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Everyday checking");
  await setup.getByLabel("Type").selectOption("checking");
  await setup.getByLabel("Opening Balance").fill("1250.50");
  await setup.getByRole("button", { name: "Add Account" }).click();
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
