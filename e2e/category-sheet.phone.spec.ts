import { expect, test } from "@playwright/test";
import {
  assign,
  budgetRow,
  categorySheet,
  createBudget,
  goTo,
  openCategory,
  record,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
});

test("rows have no Assignment field: tapping a row opens the sheet", async ({
  page,
}) => {
  await expect(page.getByLabel("Assignment for Rent")).toHaveCount(0);

  await budgetRow(page, "Rent").click();
  const sheet = categorySheet(page);
  await expect(sheet.getByText(/^Bills · 1 of \d+$/)).toBeVisible();
  await expect(sheet).toContainText("Rent");
});

test("‹ sits beside the main button, disabled on the first Category", async ({
  page,
}) => {
  const sheet = await openCategory(page, "Rent");
  const back = sheet.getByRole("button", { name: "Previous Category" });
  await expect(back).toBeDisabled();
  await expect(
    sheet.getByRole("button", { name: "Skip to next Category" }),
  ).toHaveCount(0);

  await sheet.getByRole("button", { name: "Next Category" }).click();
  await expect(sheet.getByText(/^Bills · 2 of \d+$/)).toBeVisible();
  await expect(back).toBeEnabled();
  await back.click();
  await expect(sheet.getByText(/^Bills · 1 of \d+$/)).toBeVisible();
});

test("swiping moves either way, without saving", async ({ page }) => {
  const sheet = await openCategory(page, "Rent");
  await sheet.getByRole("textbox", { name: "Assigned in October" }).fill("5");
  // Waits until the open sheet is what a finger would land on.
  const card = sheet.getByText("Carried forward from September");
  await card.click({ trial: true });
  const box = await card.boundingBox();
  if (!box) throw new Error("The breakdown has no box");
  const y = box.y + box.height / 2;
  const swipe = async (from: number, to: number) => {
    await page.mouse.move(from, y);
    await page.mouse.down();
    await page.mouse.move(to, y);
    await page.mouse.up();
  };

  await swipe(300, 100);
  await expect(sheet.getByText(/^Bills · 2 of \d+$/)).toBeVisible();
  await swipe(100, 300);
  await expect(sheet.getByText(/^Bills · 1 of \d+$/)).toBeVisible();
  await expect(
    sheet.getByRole("textbox", { name: "Assigned in October" }),
  ).toHaveValue("0.00");
});

test("Cover it opens the sheet on that Category, covering it", async ({
  page,
}) => {
  await assign(page, "Internet", "10");
  await record(page, {
    date: "2026-10-03",
    amount: "28",
    category: "Internet",
  });

  await budgetRow(page, "Internet")
    .getByRole("button", { name: "Cover it" })
    .click();
  const sheet = categorySheet(page);
  await expect(sheet).toContainText("Internet");
  await expect(
    sheet.getByRole("textbox", { name: "Assigned in October" }),
  ).toHaveValue("28.00");
  await sheet.getByRole("button", { name: "Assign $18.00 and next" }).click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(budgetRow(page, "Internet")).not.toContainText("Overspent");
});
