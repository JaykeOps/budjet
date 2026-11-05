import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  assign,
  budgetRow,
  categorySheet,
  createBudget,
  goTo,
  openCategory,
  record,
} from "./helpers";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

const assignedField = (sheet: Locator) =>
  sheet.getByRole("textbox", { name: "Assigned in October" });

async function budget(page: Page, openingBalance = "1000") {
  await createBudget(page, { firstAccount: { openingBalance } });
  await goTo(page, "Budget");
}

test("the sheet shows how Available adds up, and what saving would leave", async ({
  page,
}) => {
  await budget(page);
  await assign(page, "Groceries", "100");
  await record(page, {
    date: "2026-10-03",
    amount: "30",
    category: "Groceries",
  });

  const sheet = await openCategory(page, "Groceries");
  await expect(sheet).toContainText(/Carried forward from September\s*\$0\.00/);
  await expect(sheet).toContainText(/Assigned in October\s*\+ \$100\.00/);
  await expect(sheet).toContainText(/Spending\s*− \$30\.00/);
  await expect(sheet).toContainText(/Available\s*\$70\.00/);

  const field = assignedField(sheet);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("100.00");
  expect(
    await field.evaluate((input: HTMLInputElement) =>
      input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0),
    ),
  ).toBe("100.00");

  await field.fill("150");
  await expect(sheet).toContainText(/Groceries Available after\s*\$120\.00/);
  await expect(sheet).toContainText(/Ready to Assign after\s*\$850\.00/);
});

test('negative Spending reads "Spending + $12.00"', async ({ page }) => {
  await budget(page);
  await record(page, {
    date: "2026-10-03",
    amount: "12",
    category: "Groceries",
    money: "in",
  });

  const sheet = await openCategory(page, "Groceries");
  await expect(sheet).toContainText(/Spending\s*\+ \$12\.00/);
  await expect(sheet).not.toContainText("− −");
});

test("Enter saves and moves on, and with nothing changed the main button reads Next Category", async ({
  page,
}) => {
  await budget(page);
  const sheet = await openCategory(page, "Rent");
  await expect(sheet).toContainText("Rent");
  const steps = await sheet.getByText(/ of \d+$/).textContent();
  const total = steps?.match(/of (\d+)$/)?.[1];
  await expect(sheet.getByText(`Bills · 1 of ${total}`)).toBeVisible();

  const main = sheet.getByRole("button", {
    name: "Next Category",
    exact: true,
  });
  await expect(main).toBeVisible();
  const field = assignedField(sheet);
  await field.fill("400");
  await expect(
    sheet.getByRole("button", { name: "Assign $400.00 and next" }),
  ).toBeVisible();
  await field.press("Enter");

  await expect(sheet.getByText(`Bills · 2 of ${total}`)).toBeVisible();
  await expect(sheet).toContainText(/Ready to Assign\s*\$600\.00/);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("0.00");

  await main.click();
  await expect(sheet.getByText(`Bills · 3 of ${total}`)).toBeVisible();
});

test("a suggestion saves and moves on", async ({ page }) => {
  await budget(page);
  await assign(page, "Rent", "600");
  await page.getByRole("button", { name: "Next Month" }).click();
  await expect(
    page.getByRole("heading", { name: "November 2026" }),
  ).toBeVisible();

  const sheet = await openCategory(page, "Rent");
  await expect(sheet).toContainText("1 of");
  await sheet.getByRole("button", { name: "October: $600.00" }).click();
  await expect(sheet).toContainText("2 of");
  await expect(sheet).toContainText(/Ready to Assign\s*−\$200\.00/);

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(categorySheet(page)).toHaveCount(0);
  await expect(
    budgetRow(page, "Rent").getByRole("button", { name: "Rent", exact: true }),
  ).toBeFocused();
});

test("All of Ready to Assign adds it all to the Assignment", async ({
  page,
}) => {
  await budget(page);
  await assign(page, "Rent", "400");
  const sheet = await openCategory(page, "Rent");
  await sheet
    .getByRole("button", { name: "All of Ready to Assign: $1,000.00" })
    .click();
  await expect(sheet).toContainText(/Ready to Assign\s*\$0\.00/);
});

test("Give back shows while Ready to Assign is below zero", async ({
  page,
}) => {
  await budget(page, "100");
  await assign(page, "Rent", "150");
  const sheet = await openCategory(page, "Rent");
  await sheet.getByRole("button", { name: "Give back $50.00" }).click();
  await expect(sheet).toContainText(/Ready to Assign\s*\$0\.00/);
});

test("Cover it from Ready to Assign clears what's Overspent", async ({
  page,
}) => {
  await budget(page);
  await assign(page, "Dining Out", "60");
  await record(page, {
    date: "2026-10-03",
    amount: "80",
    category: "Dining Out",
  });

  const sheet = await openCategory(page, "Dining Out");
  await expect(assignedField(sheet)).toHaveValue("80.00");
  await sheet.getByRole("button", { name: "Cover it: $80.00" }).click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(budgetRow(page, "Dining Out")).not.toContainText("Overspent");
});

test("money can come from Another Category, which says what it takes back before saving", async ({
  page,
}) => {
  await budget(page);
  await assign(page, "Rent", "600");
  await page.getByRole("button", { name: "Next Month" }).click();
  await expect(
    page.getByRole("heading", { name: "November 2026" }),
  ).toBeVisible();

  const sheet = await openCategory(page, "Groceries");
  await sheet.getByRole("button", { name: "Another Category" }).click();
  const from = sheet.getByLabel("Take it from");
  await from.selectOption({ label: "Rent ($600.00 available)" });
  const field = sheet.getByRole("textbox", { name: "Move to Groceries" });
  await field.fill("42.50");

  await expect(sheet).toContainText(/Groceries Available after\s*\$42\.50/);
  await expect(sheet).toContainText(/Rent Available after\s*\$557\.50/);
  await expect(sheet).toContainText(
    "Takes $42.50 back from what Rent carried forward. Its November Assignment stays $0.00.",
  );
  await field.press("Enter");
  await sheet.getByRole("button", { name: "Close" }).click();

  await expect(budgetRow(page, "Rent")).toContainText("$42.50 taken back");
  await expect(budgetRow(page, "Groceries")).toContainText("$42.50");
});

test("a typed negative says what it takes back before saving", async ({
  page,
}) => {
  await budget(page);
  await assign(page, "Rent", "600");
  await page.getByRole("button", { name: "Next Month" }).click();
  await expect(
    page.getByRole("heading", { name: "November 2026" }),
  ).toBeVisible();

  const sheet = await openCategory(page, "Rent");
  const field = sheet.getByRole("textbox", { name: "Assigned in November" });
  await field.fill("-100");
  await expect(sheet).toContainText(
    "Takes $100.00 back from what Rent carried forward. Its November Assignment stays $0.00.",
  );
  await expect(sheet).toContainText(/Ready to Assign after\s*\$500\.00/);
});

test("an Overspent Category that Ready to Assign can't cover starts on a suggested source", async ({
  page,
}) => {
  await budget(page, "100");
  await assign(page, "Groceries", "100");
  await record(page, {
    date: "2026-10-03",
    amount: "20",
    category: "Dining Out",
  });

  const sheet = await openCategory(page, "Dining Out");
  await expect(sheet.getByLabel("Take it from")).toHaveValue(/.+/);
  await expect(sheet).toContainText(/Groceries Available after\s*\$80\.00/);
  await expect(
    sheet.getByRole("textbox", { name: "Move to Dining Out" }),
  ).toHaveValue("20.00");
  await sheet.getByRole("button", { name: "Move $20.00" }).click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(budgetRow(page, "Dining Out")).not.toContainText("Overspent");
});

test("a Category steps through every Category in Budget order, and the last one closes", async ({
  page,
}) => {
  await budget(page);
  const sheet = await openCategory(page, "Rent");
  const steps = await sheet.getByText(/ of \d+$/).textContent();
  const total = Number(steps?.match(/of (\d+)$/)?.[1]);
  const field = assignedField(sheet);
  for (let step = 1; step < total; step++) await field.press("ArrowDown");

  await expect(
    sheet.getByText(new RegExp(`${total} of ${total}$`)),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Done" })).toBeVisible();
  await field.press("ArrowDown");
  await expect(
    sheet.getByText(new RegExp(`${total} of ${total}$`)),
  ).toBeVisible();

  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(categorySheet(page)).toHaveCount(0);
});

test('"Assign <Group>" steps through that Category Group', async ({ page }) => {
  await budget(page);
  await page.getByRole("button", { name: "Assign Bills" }).click();
  const sheet = page.getByRole("dialog", { name: "Assign Bills" });
  await expect(sheet).toContainText("Rent");
  const steps = await sheet.getByText(/ of \d+$/).textContent();
  expect(steps).toMatch(/^Bills · 1 of \d+$/);
  const total = Number(steps?.match(/of (\d+)$/)?.[1]);

  const field = sheet.getByRole("textbox", { name: "Assigned in October" });
  for (let step = 1; step < total; step++) await field.press("Enter");
  await expect(sheet.getByText(`Bills · ${total} of ${total}`)).toBeVisible();
  await field.fill("10");
  await field.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("status", { name: "Ready to Assign" }),
  ).toHaveText(/\$990\.00/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the sheet has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await budget(page);
    await assign(page, "Rent", "1200");
    const sheet = await openCategory(page, "Rent");
    await sheet.getByRole("button", { name: "Another Category" }).click();
    await sheet.getByLabel("Take it from").selectOption({ index: 0 });
    await sheet.getByRole("textbox", { name: "Move to Rent" }).fill("10");
    await expect(sheet).toContainText("Takes");

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations.filter(({ impact }) =>
        ["serious", "critical"].includes(impact ?? ""),
      ),
    ).toEqual([]);
  });
}
