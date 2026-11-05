import { expect, type Page, test } from "@playwright/test";
import {
  assign,
  copyLastMonth,
  createBudget,
  expectAssigned,
  goTo,
  moveMoney,
  toast,
} from "./helpers";

const readyToAssign = (page: Page) =>
  page.getByRole("status", { name: "Ready to Assign" });
const undo = (page: Page) =>
  toast(page).getByRole("button", { name: "Undo", exact: true });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page);
  await goTo(page, "Budget");
});

test("an Assignment shows a toast, and Undo writes the previous amount back", async ({
  page,
}) => {
  await assign(page, "Rent", "100");
  await expect(toast(page)).toContainText("Assigned $100.00 to Rent");
  await assign(page, "Rent", "250");
  await expect(toast(page)).toContainText("Assigned $250.00 to Rent");
  await expect(readyToAssign(page)).toContainText("$750.00");

  await undo(page).click();

  await expectAssigned(page, "Rent", "$100.00");
  await expect(readyToAssign(page)).toContainText("$900.00");
  await expect(undo(page)).toHaveCount(0);
});

test("Undo applies to the latest toast only", async ({ page }) => {
  await assign(page, "Rent", "100");
  await assign(page, "Power", "20");
  await expect(toast(page)).toContainText("Assigned $20.00 to Power");

  await undo(page).click();

  await expectAssigned(page, "Rent", "$100.00");
  await expectAssigned(page, "Power", "$0.00");
  await expect(readyToAssign(page)).toContainText("$900.00");
  await expect(undo(page)).toHaveCount(0);
});

test("Move money shows a toast, and Undo puts both Categories back", async ({
  page,
}) => {
  await assign(page, "Rent", "100");
  await moveMoney(page, { from: "Rent", to: "Power", amount: "30" });
  await expect(toast(page)).toContainText("Moved $30.00 from Rent to Power");

  await undo(page).click();

  await expectAssigned(page, "Rent", "$100.00");
  await expectAssigned(page, "Power", "$0.00");
});

test("Copy last Month shows a toast, and Undo empties what it filled", async ({
  page,
}) => {
  await assign(page, "Rent", "100");
  await assign(page, "Power", "20");
  await page.getByRole("button", { name: "Next Month", exact: true }).click();

  await copyLastMonth(page);
  await expect(toast(page)).toContainText("Copied 2 Assignments from October");
  await expect(readyToAssign(page)).toContainText("$760.00");

  await undo(page).click();

  await expect(readyToAssign(page)).toContainText("$880.00");
  await copyLastMonth(page);
  await expect(readyToAssign(page)).toContainText("$760.00");
});
