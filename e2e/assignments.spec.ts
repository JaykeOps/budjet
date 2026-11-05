import { expect, test } from "@playwright/test";
import {
  assign,
  budgetRow,
  categorySheet,
  copyLastMonth,
  createBudget,
  expectAssigned,
  goTo,
  openCategory,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

test("a user assigns money to Categories and sees Ready to Assign change", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, { firstAccount: { openingBalance: "2500" } });
  await goTo(page, "Budget");

  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  await expect(readyToAssign).toHaveText(/\$2,500\.00/);

  await assign(page, "Rent", "1200");
  await expect(readyToAssign).toHaveText(/\$1,300\.00/);

  await assign(page, "Groceries", "350.50");
  await expect(readyToAssign).toHaveText(/\$949\.50/);

  await assign(page, "Rent", "1100");

  const expectAssignments = async () => {
    await expect(readyToAssign).toHaveText(/\$1,049\.50/);
    await expectAssigned(page, "Rent", "$1,100.00");
    await expectAssigned(page, "Groceries", "$350.50");
    await expectAssigned(page, "Power", "$0.00");
  };
  await expectAssignments();

  await reloadWhenSaved(page);

  await expectAssignments();
});

test("an Assignment that isn't an amount is refused", async ({ page }) => {
  await createBudget(page, { firstAccount: { openingBalance: "100" } });
  await goTo(page, "Budget");

  const sheet = await openCategory(page, "Rent");
  const field = sheet.getByRole("textbox", { name: /^Assigned in / });
  await field.fill("lots");
  await field.press("Enter");

  await expect(sheet.getByRole("alert")).toContainText("isn't an amount");
  await expect(sheet).toContainText("Rent");
  await expect(sheet).toContainText("1 of");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(categorySheet(page)).toHaveCount(0);
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
  await assign(page, "Rent", "1200");
  await assign(page, "Groceries", "300");

  await page.getByRole("button", { name: "Next Month" }).click();
  await expect(
    page.getByRole("heading", { name: "November 2026" }),
  ).toBeVisible();
  await assign(page, "Groceries", "250");

  await copyLastMonth(page);
  await expectAssigned(page, "Rent", "$1,200.00");
  await expectAssigned(page, "Groceries", "$250.00");
  await expectAssigned(page, "Power", "$0.00");

  const move = page.getByRole("form", { name: "Move money" });
  await move.getByLabel("From").selectOption("Rent");
  await move.getByLabel("To").selectOption("Groceries");
  await move.getByLabel("Amount").fill("100");
  await move.getByRole("button", { name: "Move" }).click();

  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  const expectNovember = async () => {
    await expectAssigned(page, "Rent", "$1,100.00");
    await expectAssigned(page, "Groceries", "$350.00");
    await expectAssigned(page, "Power", "$0.00");
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

  const rent = budgetRow(page, "Rent");
  await assign(page, "Rent", "600");
  await page.getByRole("button", { name: "Next Month" }).click();
  await assign(page, "Rent", "10");

  const move = page.getByRole("form", { name: "Move money" });
  await move.getByLabel("From").selectOption("Rent");
  await move.getByLabel("To").selectOption("Groceries");
  await move.getByLabel("Amount").fill("52.50");
  await move.getByRole("button", { name: "Move" }).click();

  const expectTakenBack = async () => {
    await expectAssigned(page, "Rent", "$0.00");
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
  await expectAssigned(page, "Rent", "$0.00");
});
