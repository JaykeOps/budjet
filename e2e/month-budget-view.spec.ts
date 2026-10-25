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

test("a user steps between Months, assigns money in a future Month and stays on it after a reload", async ({
  page,
}) => {
  await createBudget(page, "1000");
  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await expect(page.getByRole("table", { name: "October 2026" })).toBeVisible();

  await page.getByRole("button", { name: "Next Month" }).click();
  await expect(
    page.getByRole("table", { name: "November 2026" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/month=2026-11/);

  await page.getByRole("button", { name: "Next Month" }).click();
  const december = page.getByRole("table", { name: "December 2026" });
  await expect(december).toBeVisible();
  await expect(page).toHaveURL(/month=2026-12/);

  const rent = december.getByLabel("Assignment for Rent");
  await rent.fill("150");
  await rent.press("Enter");
  await expect(readyToAssign).toHaveText(/\$850\.00/);

  await page.reload();

  await expect(december).toBeVisible();
  await expect(rent).toHaveValue("150.00");
  await expect(readyToAssign).toHaveText(/\$850\.00/);

  await page.goBack();
  await expect(
    page.getByRole("table", { name: "November 2026" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Previous Month" }).click();
  const october = page.getByRole("table", { name: "October 2026" });
  await expect(october).toBeVisible();
  await expect(october.getByLabel("Assignment for Rent")).toHaveValue("0.00");
  await expect(readyToAssign).toHaveText(/\$850\.00/);
});

test("Months before the Budget was created can't be opened", async ({
  page,
}) => {
  await createBudget(page, "0");
  await expect(page.getByRole("table", { name: "October 2026" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous Month" }),
  ).toBeDisabled();

  await page.goto("/?month=2026-09");
  await expect(page.getByRole("table", { name: "October 2026" })).toBeVisible();
  await expect(page).toHaveURL(/month=2026-10/);

  await page.goto("/?month=not-a-month");
  await expect(page.getByRole("table", { name: "October 2026" })).toBeVisible();
});

async function recordSpending(
  page: Page,
  date: string,
  amount: string,
  category: string,
) {
  const record = page.getByRole("form", { name: "Record a Transaction" });
  await record.getByLabel("Date").fill(date);
  await record.getByLabel("Amount").fill(amount);
  await record.getByLabel("Category").selectOption({ label: category });
  await record.getByRole("button", { name: "Record Transaction" }).click();
}

async function assign(page: Page, category: string, amount: string) {
  const input = page.getByLabel(`Assignment for ${category}`);
  await input.fill(amount);
  await input.press("Enter");
}

test("an Overspent Category is red in its Month and the next until an Assignment covers it", async ({
  page,
}) => {
  await createBudget(page, "1000");
  await assign(page, "Groceries", "100");
  await recordSpending(page, "2026-10-12", "150", "Groceries");

  const groceries = (month: string) =>
    page
      .getByRole("table", { name: month })
      .getByRole("row", { name: /Groceries/ });
  const overspent = page.getByRole("list", { name: "Overspent Categories" });
  const expectOverspent = async (month: string) => {
    const available = groceries(month).locator("td.available");
    await expect(available).toHaveText("-$50.00");
    await expect(available).toHaveClass(/overspent/);
    await expect(available).toHaveCSS("color", "rgb(178, 34, 34)");
    await expect(overspent.getByRole("listitem")).toHaveText([
      /Groceries.*-\$50\.00/,
    ]);
  };

  await expectOverspent("October 2026");
  await page.getByRole("button", { name: "Next Month" }).click();
  await expectOverspent("November 2026");

  await page.reload();
  await expectOverspent("November 2026");

  await assign(page, "Groceries", "50");

  const covered = async () => {
    const available = groceries("November 2026").locator("td.available");
    await expect(available).toHaveText("$0.00");
    await expect(available).not.toHaveClass(/overspent/);
    await expect(overspent).toHaveCount(0);
  };
  await covered();

  await page.reload();
  await covered();
});

test("Category Groups show subtotals and collapse and expand", async ({
  page,
}) => {
  await createBudget(page, "1000");
  await assign(page, "Groceries", "300");
  await assign(page, "Transport", "50.50");
  await recordSpending(page, "2026-10-03", "20", "Groceries");
  await recordSpending(page, "2026-10-04", "10.25", "Dining Out");

  const october = page.getByRole("table", { name: "October 2026" });
  const everyday = october.getByRole("row", { name: /^Everyday/ });
  const expectSubtotals = async () => {
    await expect(everyday.getByRole("cell")).toHaveText([
      "$350.50",
      "$30.25",
      "$320.25",
    ]);
  };
  await expectSubtotals();

  const toggle = october.getByRole("button", { name: "Everyday" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(october.getByLabel("Assignment for Groceries")).toHaveCount(0);
  await expect(october.getByLabel("Assignment for Rent")).toBeVisible();
  await expectSubtotals();

  await toggle.click();
  await expect(october.getByLabel("Assignment for Groceries")).toBeVisible();

  await page.reload();
  await expectSubtotals();
});
