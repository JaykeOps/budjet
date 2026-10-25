import { expect, type Page, test } from "@playwright/test";

async function createBudget(page: Page, openingBalance: string) {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill(openingBalance);
  await setup.getByRole("button", { name: "Add Account" }).click();
}

test("the Month Budget view opens on the current Month with every Category in its Category Group", async ({
  page,
}) => {
  await createBudget(page, "0");
  await page.getByRole("button", { name: "Move Savings up" }).click();

  const month = page.getByRole("table", { name: "October 2026" });
  const expectOutline = async () =>
    expect(month.getByRole("rowheader")).toHaveText([
      "Bills",
      "Rent",
      "Power",
      "Phone",
      "Internet",
      "Savings",
      "Emergency Fund",
      "Everyday",
      "Groceries",
      "Transport",
      "Dining Out",
    ]);
  await expectOutline();

  await page.reload();

  await expectOutline();
});

test("Ready to Assign turns into a red warning once more is assigned than there is", async ({
  page,
}) => {
  await createBudget(page, "1000");
  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await expect(readyToAssign).toHaveText(/\$1,000\.00/);
  await expect(readyToAssign).not.toHaveClass(/overassigned/);

  await page.getByLabel("Assignment for Rent").fill("1200");
  await page.getByLabel("Assignment for Rent").press("Enter");

  const expectWarning = async () => {
    await expect(readyToAssign).toHaveText(/-\$200\.00/);
    await expect(readyToAssign).toHaveClass(/overassigned/);
    await expect(readyToAssign.locator("strong")).toHaveCSS(
      "color",
      "rgb(178, 34, 34)",
    );
  };
  await expectWarning();

  await page.reload();

  await expectWarning();
});
