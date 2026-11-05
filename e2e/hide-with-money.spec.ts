import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  assign,
  budgetOutline,
  createBudget,
  deleteEntry,
  finishEditing,
  goTo,
  hideCategory,
  openMore,
  record,
  startEditing,
  toast,
} from "./helpers";

const button = (scope: Page | Locator, name: string) =>
  scope.getByRole("button", { name, exact: true });

const readyToAssign = (page: Page) =>
  page.getByRole("status", { name: "Ready to Assign" });

const nextMonth = (page: Page) => button(page, "Next Month").click();
const previousMonth = (page: Page) => button(page, "Previous Month").click();

const editorRow = (page: Page, name: string) =>
  page.getByRole("listitem").filter({
    has: page.getByRole("textbox", { name: `Name of ${name}`, exact: true }),
  });

/** Opens the hide sheet of a Category that holds money. */
async function startHiding(page: Page, name: string): Promise<Locator> {
  await startEditing(page);
  const sheet = await openMore(page, name);
  await button(sheet, `Hide ${name}`).click();
  return sheet;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page);
  await goTo(page, "Budget");
});

test("Move and hide sends the money to Ready to Assign, and Undo brings it all back", async ({
  page,
}) => {
  await assign(page, "Rent", "750");
  await expect(readyToAssign(page)).toContainText("$250.00");

  const sheet = await startHiding(page, "Rent");
  await expect(sheet).toContainText("Rent has $750.00 Available.");
  await button(sheet, "Move $750.00 and hide").click();

  await expect(toast(page)).toContainText("Hid Rent");
  await finishEditing(page);
  await expect(readyToAssign(page)).toContainText("$1,000.00");

  await button(toast(page), "Undo").click();
  await expect(readyToAssign(page)).toContainText("$250.00");
  await expect.poll(() => budgetOutline(page)).toContain("Rent");
});

test("Move and hide can send the money to a Category", async ({ page }) => {
  await assign(page, "Rent", "750");
  await assign(page, "Power", "10");

  const sheet = await startHiding(page, "Rent");
  await sheet
    .getByLabel("Move it to")
    .selectOption({ label: "Power, Bills ($10.00)" });
  await button(sheet, "Move $750.00 and hide").click();

  await expect(toast(page)).toContainText("Hid Rent");
  await expect(editorRow(page, "Power")).toContainText("$760.00");
  await finishEditing(page);
  await expect(readyToAssign(page)).toContainText("$240.00");
});

test("Cover and hide comes from Ready to Assign or a Category", async ({
  page,
}) => {
  await record(page, { amount: "18", category: "Rent" });
  await record(page, { amount: "18", category: "Power" });
  await goTo(page, "Budget");
  await assign(page, "Groceries", "20");
  await expect(readyToAssign(page)).toContainText("$980.00");

  const rent = await startHiding(page, "Rent");
  await expect(rent).toContainText("Rent is Overspent by $18.00.");
  await button(rent, "Cover $18.00 and hide").click();
  await expect(toast(page)).toContainText("Hid Rent");
  await finishEditing(page);
  await expect(readyToAssign(page)).toContainText("$962.00");

  const power = await startHiding(page, "Power");
  await power
    .getByLabel("Cover it from")
    .selectOption({ label: "Groceries, Everyday ($20.00)" });
  await button(power, "Cover $18.00 and hide").click();
  await expect(toast(page)).toContainText("Hid Power");
  await expect(editorRow(page, "Groceries")).toContainText("$2.00");
  await finishEditing(page);
  await expect(readyToAssign(page)).toContainText("$962.00");
});

test("the sheet says when later Months have Assignments, and hiding clears them", async ({
  page,
}) => {
  await nextMonth(page);
  await assign(page, "Rent", "30");
  await nextMonth(page);
  await assign(page, "Rent", "20");
  await nextMonth(page);
  await assign(page, "Power", "5");
  await expect(readyToAssign(page)).toContainText("$945.00");

  const rent = await startHiding(page, "Rent");
  await expect(rent).toContainText(
    "Rent has $50.00 assigned across 2 later Months. Hiding sets all of them to $0.00, and it goes back to Ready to Assign.",
  );
  await button(rent, "Set to $0.00 and hide").click();
  await expect(toast(page)).toContainText("Hid Rent");
  await finishEditing(page);
  await expect(readyToAssign(page)).toContainText("$995.00");

  const power = await startHiding(page, "Power");
  await expect(power).toContainText(
    "Power has $5.00 assigned in January 2027. Hiding sets that to $0.00",
  );
  await button(power, "Keep Power as it is").click();
  await button(power, "Hide Power").click();
  await button(power, "Set to $0.00 and hide").click();
  await expect(toast(page)).toContainText("Hid Power");
  await finishEditing(page);
  await expect(readyToAssign(page)).toContainText("$1,000.00");

  await button(toast(page), "Undo").click();
  await expect(readyToAssign(page)).toContainText("$995.00");
});

test("the Budget flags a hidden Category that gains money until Available is $0.00", async ({
  page,
}) => {
  await assign(page, "Rent", "12.50");
  await record(page, { amount: "12.50", category: "Rent" });
  await goTo(page, "Budget");
  await hideCategory(page, "Rent");
  const line = page.getByText("Rent is hidden and has $12.50 Available.");
  await expect(line).toHaveCount(0);

  await goTo(page, "Activity");
  await deleteEntry(
    page,
    page
      .getByRole("table", { name: /^History of/ })
      .getByRole("row", { name: /\$12\.50/ }),
  );
  await goTo(page, "Budget");
  await expect(line).toBeVisible();

  await button(page, "Move it").click();
  const sheet = page.getByRole("dialog", { name: "Sort out Rent" });
  await expect(sheet).toContainText("Rent has $12.50 Available.");
  await expect(sheet).not.toContainText("and hide");
  await button(sheet, "Move $12.50").click();

  await expect(toast(page)).toContainText("Moved $12.50 out of Rent");
  await expect(line).toHaveCount(0);
  await button(toast(page), "Undo").click();
  await expect(line).toBeVisible();
});

test("undoing an Unhide of a Category holding money hides it again", async ({
  page,
}) => {
  await assign(page, "Rent", "12.50");
  await record(page, { amount: "12.50", category: "Rent" });
  await goTo(page, "Budget");
  await hideCategory(page, "Rent");
  await goTo(page, "Activity");
  await deleteEntry(
    page,
    page
      .getByRole("table", { name: /^History of/ })
      .getByRole("row", { name: /\$12\.50/ }),
  );
  await goTo(page, "Budget");

  await startEditing(page);
  await button(await openMore(page, "Rent"), "Unhide Rent").click();
  await expect(toast(page)).toContainText("Rent is back");
  await button(toast(page), "Undo").click();

  await expect(page.getByText(/another device/)).toHaveCount(0);
  await expect(page.getByText("Hidden", { exact: true })).toBeVisible();
  await finishEditing(page);
  await expect(
    page.getByText("Rent is hidden and has $12.50 Available."),
  ).toBeVisible();
});

test("a later Month's Take-back survives hiding, and that Month flags it to cover", async ({
  page,
}) => {
  await assign(page, "Rent", "100");
  await nextMonth(page);
  await assign(page, "Rent", "-30");
  await previousMonth(page);

  const sheet = await startHiding(page, "Rent");
  await button(sheet, "Move $100.00 and hide").click();
  await expect(toast(page)).toContainText("Hid Rent");
  await finishEditing(page);
  await expect(page.getByText(/Rent is hidden/)).toHaveCount(0);

  await nextMonth(page);
  const line = page.getByText("Rent is hidden and is Overspent by $30.00.");
  await expect(line).toBeVisible();
  await button(page, "Cover it").click();
  await button(
    page.getByRole("dialog", { name: "Sort out Rent" }),
    "Cover $30.00",
  ).click();
  await expect(toast(page)).toContainText("Covered Rent");
  await expect(line).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`hiding with money has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await assign(page, "Rent", "50");
    await nextMonth(page);
    await assign(page, "Rent", "-5");
    await previousMonth(page);

    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
    };
    const sheet = await startHiding(page, "Rent");
    await expect(sheet.getByLabel("Move it to")).toBeVisible();
    await scan();

    await button(sheet, "Move $50.00 and hide").click();
    await expect(toast(page)).toContainText("Hid Rent");
    await finishEditing(page);
    await nextMonth(page);
    await expect(page.getByText(/Rent is hidden/)).toBeVisible();
    await scan();

    await button(page, "Cover it").click();
    await expect(
      page.getByRole("dialog", { name: "Sort out Rent" }),
    ).toBeVisible();
    await scan();
  });
}
