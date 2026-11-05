import { expect, test } from "@playwright/test";
import { assign, budgetRow, createBudget, goTo, record } from "./helpers";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

test("each Category Group is a table of Assigned, Spending and Available, with subtotals", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await assign(page, "Groceries", "300");
  await assign(page, "Transport", "50.50");
  await record(page, {
    date: "2026-10-03",
    amount: "20",
    category: "Groceries",
  });
  await record(page, {
    date: "2026-10-04",
    amount: "10.25",
    category: "Dining Out",
  });

  const everyday = page.getByRole("table", { name: "Everyday" });
  await expect(everyday.getByRole("columnheader")).toHaveText([
    "Category",
    "Assigned",
    "Spending",
    /Available/,
  ]);
  await expect(
    everyday.getByRole("row", { name: /^Everyday/ }).getByRole("cell"),
  ).toHaveText(["$350.50", "$30.25", "$320.25"]);

  const groceries = budgetRow(page, "Groceries").getByRole("cell");
  await expect(groceries.nth(0).getByRole("textbox")).toHaveValue("300.00");
  await expect(groceries.nth(1)).toHaveText("$20.00");
  await expect(groceries.nth(2)).toHaveText("$280.00");
});

test("the Spending column and subtotal show a negative figure as it is", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await assign(page, "Groceries", "100");
  await record(page, {
    date: "2026-10-05",
    amount: "12",
    category: "Groceries",
    money: "in",
  });

  await expect(
    budgetRow(page, "Groceries").getByRole("cell").nth(1),
  ).toHaveText("−$12.00");
  await expect(budgetRow(page, "Everyday").getByRole("cell").nth(1)).toHaveText(
    "−$12.00",
  );
});

test("carried forward shows under a name only when it isn't zero", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await assign(page, "Rent", "600");
  await page.getByRole("button", { name: "Next Month" }).click();
  await expect(
    page.getByRole("heading", { name: "November 2026" }),
  ).toBeVisible();

  await expect(budgetRow(page, "Rent").getByRole("rowheader")).toContainText(
    "$600.00 carried forward",
  );
  await expect(
    budgetRow(page, "Power").getByRole("rowheader"),
  ).not.toContainText("carried forward");
});

test("the summary column stays in view while the table scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await createBudget(page);
  await goTo(page, "Budget");

  await budgetRow(page, "Dining Out").scrollIntoViewIfNeeded();

  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(
    page.getByRole("status", { name: "Ready to Assign" }),
  ).toBeInViewport();
});
