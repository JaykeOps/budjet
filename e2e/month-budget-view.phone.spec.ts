import { expect, test } from "@playwright/test";
import { assign, budgetRow, createBudget, goTo, record } from "./helpers";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

test("a phone reads from the top: Month, Ready to Assign, Spent this Month, then each Category Group", async ({
  page,
}) => {
  await createBudget(page);
  await goTo(page, "Budget");

  const tops = await Promise.all(
    [
      page.getByRole("navigation", { name: "Months" }),
      page.getByRole("status", { name: "Ready to Assign" }),
      page.getByRole("region", { name: "Spent this Month" }),
      page.getByRole("list", { name: "Bills" }),
      page.getByRole("list", { name: "Everyday" }),
    ].map(async (part) => (await part.boundingBox())?.y ?? Number.NaN),
  );
  expect(tops).toEqual(tops.toSorted((a, b) => a - b));
});

test("a row's note reads Spending against what it had, or says what's wrong", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
  await expect(budgetRow(page, "Rent")).toContainText("Nothing assigned yet");

  await assign(page, "Power", "50");
  await expect(budgetRow(page, "Power")).toContainText("$0.00 of $50.00 spent");

  await assign(page, "Groceries", "100");
  await record(page, {
    date: "2026-10-03",
    amount: "40",
    category: "Groceries",
  });
  await expect(budgetRow(page, "Groceries")).toContainText(
    "$40.00 of $100.00 spent",
  );

  await record(page, {
    date: "2026-10-04",
    amount: "12",
    category: "Phone",
    money: "in",
  });
  await expect(budgetRow(page, "Phone")).toContainText("−$12.00 spent");
  await expect(budgetRow(page, "Phone")).not.toContainText(
    "Nothing assigned yet",
  );

  await record(page, {
    date: "2026-10-05",
    amount: "18",
    category: "Internet",
  });
  await expect(budgetRow(page, "Internet")).toContainText(
    "Overspent by $18.00",
  );
});

test("each Category Group shows its Available subtotal, which can be negative", async ({
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

  await expect(page.getByRole("region", { name: "Everyday" })).toContainText(
    /Available.*\$330\.50/,
  );
  await record(page, {
    date: "2026-10-04",
    amount: "400",
    category: "Rent",
  });
  await expect(page.getByRole("region", { name: "Bills" })).toContainText(
    /Available.*−\$400\.00/,
  );
});
