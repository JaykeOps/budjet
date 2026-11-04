import { expect, test } from "@playwright/test";
import { createBudget, goTo } from "./helpers";
import { reloadWhenSaved } from "./reload";

test("a user assigns money to Categories and sees Ready to Assign change", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, { firstAccount: { openingBalance: "2500" } });
  await goTo(page, "Budget");

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

  await reloadWhenSaved(page);

  await expectAssigned();
});

test("an Assignment that isn't an amount is refused", async ({ page }) => {
  await createBudget(page, { firstAccount: { openingBalance: "100" } });
  await goTo(page, "Budget");

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
  await createBudget(page, { firstAccount: { openingBalance: "5000" } });
  await goTo(page, "Budget");

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

  await reloadWhenSaved(page);

  await expectNovember();
});

test("moving more than a Category's Assignment takes the rest back from what it carried forward", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");

  const rent = page.getByRole("row", { name: /^Rent/ });
  await page.getByLabel("Assignment for Rent").fill("600");
  await page.getByLabel("Assignment for Rent").press("Enter");
  await page.getByRole("button", { name: "Next Month" }).click();
  await page.getByLabel("Assignment for Rent").fill("10");
  await page.getByLabel("Assignment for Rent").press("Enter");

  const move = page.getByRole("form", { name: "Move money" });
  await move.getByLabel("From").selectOption("Rent");
  await move.getByLabel("To").selectOption("Groceries");
  await move.getByLabel("Amount").fill("52.50");
  await move.getByRole("button", { name: "Move" }).click();

  const expectTakenBack = async () => {
    await expect(page.getByLabel("Assignment for Rent")).toHaveValue("0.00");
    await expect(rent).toContainText("$42.50 taken back");
    await expect(rent).toContainText("$557.50");
    await expect(
      page.getByRole("status", { name: "Ready to Assign" }),
    ).toHaveText(/\$390\.00/);
  };
  await expectTakenBack();

  await reloadWhenSaved(page);

  await expectTakenBack();
});

test("moving money to the same Category is refused", async ({ page }) => {
  await createBudget(page, { firstAccount: { openingBalance: "100" } });
  await goTo(page, "Budget");

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
