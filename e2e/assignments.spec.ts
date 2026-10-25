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
