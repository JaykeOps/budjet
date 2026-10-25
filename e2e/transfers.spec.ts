import { expect, type Page, test } from "@playwright/test";

/** A Budget in USD with Checking holding $1,000 and Savings holding $500. */
async function createBudget(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill("1000");
  await setup.getByRole("button", { name: "Add Account" }).click();
  const add = page.getByRole("form", { name: "Add an Account" });
  await add.getByLabel("Name").fill("Savings");
  await add.getByLabel("Type").selectOption("savings");
  await add.getByLabel("Opening Balance").fill("500");
  await add.getByRole("button", { name: "Add Account" }).click();
}

function balanceOf(page: Page, account: string) {
  return page
    .getByRole("table", { name: "Accounts" })
    .getByRole("row", { name: new RegExp(account) });
}

test("a user moves money between Accounts and sees both balances change", async ({
  page,
}) => {
  await createBudget(page);
  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await expect(readyToAssign).toHaveText(/\$1,500\.00/);

  const make = page.getByRole("form", { name: "Make a Transfer" });
  await make.getByLabel("From").selectOption({ label: "Checking" });
  await make.getByLabel("To").selectOption({ label: "Savings" });
  await make.getByLabel("Amount").fill("200");
  await make.getByLabel("Memo").fill("Rainy day");
  await make.getByRole("button", { name: "Make Transfer" }).click();

  const expectMoved = async () => {
    await expect(balanceOf(page, "Checking")).toContainText("$800.00");
    await expect(balanceOf(page, "Savings")).toContainText("$700.00");
    await expect(readyToAssign).toHaveText(/\$1,500\.00/);
    const checking = page.getByRole("table", {
      name: "Transactions in Checking",
    });
    await expect(checking.getByRole("row").nth(1)).toContainText(
      /2026-10-15.*Transfer to Savings.*Rainy day.*-\$200\.00/,
    );
    await page
      .getByRole("region", { name: "Transactions", exact: true })
      .getByRole("combobox", { name: /^Account/ })
      .selectOption({ label: "Savings" });
    await expect(
      page
        .getByRole("table", { name: "Transactions in Savings" })
        .getByRole("row")
        .nth(1),
    ).toContainText(/Transfer from Checking.*Rainy day.*\$200\.00/);
  };
  await expectMoved();

  await page.reload();

  await expectMoved();
});

test("a user edits and deletes a Transfer", async ({ page }) => {
  await createBudget(page);
  const make = page.getByRole("form", { name: "Make a Transfer" });
  await make.getByLabel("Amount").fill("200");
  await make.getByRole("button", { name: "Make Transfer" }).click();
  const transfers = page.getByRole("table", { name: "Transfers" });

  await transfers.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("form", { name: "Edit Transfer" });
  await expect(edit.getByLabel("Amount")).toHaveValue("200.00");
  await edit.getByLabel("Amount").fill("50");
  await edit.getByRole("button", { name: "Save Transfer" }).click();

  await expect(edit).toHaveCount(0);
  await expect(balanceOf(page, "Checking")).toContainText("$950.00");
  await expect(balanceOf(page, "Savings")).toContainText("$550.00");
  await page.reload();
  await expect(balanceOf(page, "Checking")).toContainText("$950.00");

  await transfers.getByRole("button", { name: "Delete" }).click();

  await expect(transfers.getByRole("row")).toHaveCount(1);
  await expect(balanceOf(page, "Checking")).toContainText("$1,000.00");
  await page.reload();
  await expect(balanceOf(page, "Savings")).toContainText("$500.00");
});

test("a Transfer to the same Account is refused", async ({ page }) => {
  await createBudget(page);

  const make = page.getByRole("form", { name: "Make a Transfer" });
  await make.getByLabel("To").selectOption({ label: "Checking" });
  await make.getByLabel("Amount").fill("20");
  await make.getByRole("button", { name: "Make Transfer" }).click();

  await expect(make.getByRole("alert")).toContainText("two different Accounts");
  await expect(balanceOf(page, "Checking")).toContainText("$1,000.00");
});
