import { expect, test } from "@playwright/test";

test("a user assigns money to Categories and sees Ready to Assign change", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill("2500");
  await setup.getByRole("button", { name: "Add Account" }).click();

  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await expect(readyToAssign).toHaveText(/\$2,500\.00/);

  const rent = page.getByLabel("Assignment for Rent");
  await rent.fill("1200");
  await rent.press("Enter");
  await expect(readyToAssign).toHaveText(/\$1,300\.00/);

  const groceries = page.getByLabel("Assignment for Groceries");
  await groceries.fill("350.50");
  await groceries.blur();
  await expect(readyToAssign).toHaveText(/\$949\.50/);

  await rent.fill("1100");
  await rent.press("Enter");

  const expectAssigned = async () => {
    await expect(readyToAssign).toHaveText(/\$1,049\.50/);
    await expect(rent).toHaveValue("1100.00");
    await expect(groceries).toHaveValue("350.50");
    await expect(page.getByLabel("Assignment for Power")).toHaveValue("0.00");
  };
  await expectAssigned();

  await page.reload();

  await expectAssigned();
});

test("an Assignment that isn't an amount is refused", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill("100");
  await setup.getByRole("button", { name: "Add Account" }).click();

  const rent = page.getByLabel("Assignment for Rent");
  await rent.fill("lots");
  await rent.press("Enter");

  await expect(page.getByRole("alert")).toContainText("isn't an amount");
  await expect(
    page.getByRole("status", { name: "Ready to Assign" }),
  ).toHaveText(/\$100\.00/);
});

test("a user copies last Month's Assignments and moves money between Categories", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill("5000");
  await setup.getByRole("button", { name: "Add Account" }).click();

  await expect(
    page.getByRole("button", { name: "Copy last Month" }),
  ).toHaveCount(0);
  for (const [category, amount] of [
    ["Rent", "1200"],
    ["Groceries", "300"],
  ]) {
    await page.getByLabel(`Assignment for ${category}`).fill(amount);
    await page.getByLabel(`Assignment for ${category}`).press("Enter");
  }

  await page.getByRole("button", { name: "Next Month" }).click();
  const november = page.getByRole("table", { name: "November 2026" });
  const rent = november.getByLabel("Assignment for Rent");
  const groceries = november.getByLabel("Assignment for Groceries");
  const power = november.getByLabel("Assignment for Power");
  await groceries.fill("250");
  await groceries.press("Enter");

  await page.getByRole("button", { name: "Copy last Month" }).click();
  await expect(rent).toHaveValue("1200.00");
  await expect(groceries).toHaveValue("250.00");
  await expect(power).toHaveValue("0.00");

  const move = page.getByRole("form", { name: "Move money" });
  await move.getByLabel("From").selectOption("Rent");
  await move.getByLabel("To").selectOption("Groceries");
  await move.getByLabel("Amount").fill("100");
  await move.getByRole("button", { name: "Move" }).click();

  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  const expectNovember = async () => {
    await expect(rent).toHaveValue("1100.00");
    await expect(groceries).toHaveValue("350.00");
    await expect(power).toHaveValue("0.00");
    await expect(readyToAssign).toHaveText(/\$2,050\.00/);
  };
  await expectNovember();

  await page.reload();

  await expectNovember();
});

test("moving money to the same Category is refused", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Currency").selectOption("USD");
  await page.getByRole("button", { name: "Create Budget" }).click();
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill("Checking");
  await setup.getByLabel("Opening Balance").fill("100");
  await setup.getByRole("button", { name: "Add Account" }).click();

  const move = page.getByRole("form", { name: "Move money" });
  await move.getByLabel("From").selectOption("Rent");
  await move.getByLabel("To").selectOption("Rent");
  await move.getByLabel("Amount").fill("10");
  await move.getByRole("button", { name: "Move" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "two different Categories",
  );
  await expect(page.getByLabel("Assignment for Rent")).toHaveValue("0.00");
});
