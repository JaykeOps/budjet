import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { budgetRow, createBudget, goTo, record } from "./helpers";

const field = (page: Page, category: string) =>
  page.getByLabel(`Assignment for ${category}`);
const panel = (page: Page) =>
  page.getByRole("region", { name: "Explaining the focused row" });
const readyToAssign = (page: Page) =>
  page.getByRole("status", { name: "Ready to Assign" });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, { firstAccount: { openingBalance: "1000" } });
  await goTo(page, "Budget");
});

test("Enter and ↓ save and move down, ↑ saves and moves up", async ({
  page,
}) => {
  await field(page, "Rent").click();
  await page.keyboard.type("600");
  await page.keyboard.press("Enter");
  await expect(field(page, "Power")).toBeFocused();
  await expect(field(page, "Rent")).toHaveValue("600.00");
  await expect(readyToAssign(page)).toHaveText(/\$400\.00/);

  await page.keyboard.type("100");
  await page.keyboard.press("ArrowDown");
  await expect(field(page, "Phone")).toBeFocused();
  await expect(readyToAssign(page)).toHaveText(/\$300\.00/);

  await page.keyboard.type("50");
  await page.keyboard.press("ArrowUp");
  await expect(field(page, "Power")).toBeFocused();
  await expect(readyToAssign(page)).toHaveText(/\$250\.00/);
});

test("Esc goes back to what's saved", async ({ page }) => {
  await field(page, "Rent").fill("600");
  await page.keyboard.press("Enter");
  await field(page, "Rent").fill("999");
  await expect(panel(page)).toContainText("Ready to Assign after");
  await page.keyboard.press("Escape");

  await expect(field(page, "Rent")).toHaveValue("600.00");
  await expect(field(page, "Rent")).toBeFocused();
  await expect(panel(page)).toContainText("Ready to Assign is");
  await page.keyboard.press("Tab");
  await expect(readyToAssign(page)).toHaveText(/\$400\.00/);
});

test("something that isn't an amount stays put and says why", async ({
  page,
}) => {
  await field(page, "Rent").fill("lots");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("isn't an amount");
  await expect(field(page, "Rent")).toBeFocused();
  await expect(field(page, "Rent")).toHaveValue("lots");
});

test("the panel explains the focused row, as it would be with what's typed", async ({
  page,
}) => {
  await expect(panel(page)).toContainText("How Available adds up");
  await field(page, "Rent").fill("250");

  await expect(panel(page)).toContainText("Rent");
  await expect(panel(page)).toContainText(/Assigned in October\s*\+ \$250\.00/);
  await expect(panel(page)).toContainText(/Available\s*\$250\.00/);
  await expect(panel(page)).toContainText("Ready to Assign after $750.00");

  await field(page, "Power").focus();
  await expect(panel(page)).toContainText("Power");
  await expect(panel(page)).toContainText("Ready to Assign is $750.00");
});

test("clicking a suggestion saves it rather than what's typed, and moves on", async ({
  page,
}) => {
  await field(page, "Rent").fill("5");
  await panel(page)
    .getByRole("button", { name: /^All of Ready to Assign/ })
    .click();

  await expect(field(page, "Power")).toBeFocused();
  await expect(field(page, "Rent")).toHaveValue("1000.00");
  await expect(readyToAssign(page)).toHaveText(/\$0\.00/);
});

test("the panel hides and comes back", async ({ page }) => {
  await panel(page).getByRole("button", { name: "Hide" }).click();
  await expect(panel(page)).toHaveCount(0);

  const show = page.getByRole("button", { name: "Show how Available adds up" });
  await expect(show).toBeFocused();
  await show.click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Hide" })).toBeFocused();
});

test("Cover focuses an Overspent row, whose panel offers to cover it", async ({
  page,
}) => {
  await record(page, {
    date: "2026-10-04",
    amount: "18",
    category: "Phone",
    money: "out",
  });
  await goTo(page, "Budget");
  await budgetRow(page, "Phone")
    .getByRole("button", { name: "Cover Phone" })
    .click();

  await expect(field(page, "Phone")).toBeFocused();
  await expect(panel(page)).toContainText("Phone");
  await expect(
    panel(page).getByRole("button", { name: "Cover it: $18.00" }),
  ).toBeVisible();
});

test("Copy last Month opens the preview, and copies nothing until asked", async ({
  page,
}) => {
  await field(page, "Rent").fill("100");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Next Month" }).click();
  await expect(
    page.getByRole("heading", { name: "November 2026" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Copy last Month" }).click();
  const preview = page.getByRole("dialog", { name: "Copy October" });
  await expect(preview.getByRole("checkbox", { name: /Rent/ })).toBeChecked();
  await expect(field(page, "Rent")).toHaveValue("0.00");

  await preview.getByRole("button", { name: "Copy 1 Assignment" }).click();
  await expect(preview).toHaveCount(0);
  await expect(field(page, "Rent")).toHaveValue("100.00");
});

test("Move money takes From, To and Amount", async ({ page }) => {
  await field(page, "Rent").fill("100");
  await page.keyboard.press("Enter");
  const open = page.getByRole("button", { name: "Move money" });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Move money" });

  await dialog
    .getByLabel("From", { exact: true })
    .selectOption({ label: "Rent ($100.00)" });
  await dialog
    .getByLabel("To", { exact: true })
    .selectOption({ label: "Power ($0.00)" });
  await dialog.getByLabel("Amount").fill("150");
  await expect(dialog.getByRole("alert")).toHaveText(
    "Rent has $100.00 that can move.",
  );
  await expect(dialog.getByRole("button", { name: /^Move / })).toBeDisabled();

  await dialog.getByLabel("Amount").fill("30");
  await expect(dialog).toContainText(/Rent after\s*\$70\.00/);
  await dialog.getByRole("button", { name: "Move $30.00" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(field(page, "Rent")).toHaveValue("70.00");
  await expect(field(page, "Power")).toHaveValue("30.00");
  await expect(readyToAssign(page)).toHaveText(/\$900\.00/);
});

test("Move money goes to and from Ready to Assign, but not between an end and itself", async ({
  page,
}) => {
  const open = page.getByRole("button", { name: "Move money" });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Move money" });
  await dialog
    .getByLabel("To", { exact: true })
    .selectOption({ label: "Rent ($0.00)" });
  await dialog.getByLabel("Amount").fill("40");
  await dialog.getByRole("button", { name: "Move $40.00" }).click();
  await expect(field(page, "Rent")).toHaveValue("40.00");
  await expect(readyToAssign(page)).toHaveText(/\$960\.00/);

  await open.click();
  await dialog
    .getByLabel("From", { exact: true })
    .selectOption({ label: "Rent ($40.00)" });
  await dialog
    .getByLabel("To", { exact: true })
    .selectOption({ label: "Ready to Assign ($960.00)" });
  await dialog.getByLabel("Amount").fill("15");
  await dialog.getByRole("button", { name: "Move $15.00" }).click();
  await expect(field(page, "Rent")).toHaveValue("25.00");
  await expect(readyToAssign(page)).toHaveText(/\$975\.00/);

  await open.click();
  await dialog
    .getByLabel("From", { exact: true })
    .selectOption({ label: "Rent ($25.00)" });
  await dialog
    .getByLabel("To", { exact: true })
    .selectOption({ label: "Rent ($25.00)" });
  await dialog.getByLabel("Amount").fill("5");
  await expect(dialog.getByRole("button", { name: /^Move / })).toBeDisabled();
});

test("everything works by keyboard alone", async ({ page }) => {
  await record(page, {
    date: "2026-10-04",
    amount: "18",
    category: "Phone",
    money: "out",
  });
  await goTo(page, "Budget");

  // To Cover, by Tab alone.
  const cover = budgetRow(page, "Phone").getByRole("button", {
    name: "Cover Phone",
  });
  await cover.focus();
  await page.keyboard.press("Enter");
  await expect(field(page, "Phone")).toBeFocused();

  // From the field to the panel's first suggestion, and back with Esc.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Go to the panel" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const suggestion = panel(page).getByRole("button", {
    name: "Cover it: $18.00",
  });
  await expect(suggestion).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(field(page, "Phone")).toBeFocused();

  // A suggestion by keyboard saves and moves on.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(suggestion).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(field(page, "Phone")).toHaveValue("18.00");
  await expect(budgetRow(page, "Phone")).not.toContainText("Overspent");

  // Move money, with nothing but keys.
  await page.getByRole("button", { name: "Move money" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Move money" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Move money" })).toBeFocused();
});

for (const scheme of ["light", "dark"] as const) {
  test(`the panel and Move money pass axe in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await field(page, "Rent").fill("25");
    await expect(panel(page)).toContainText("Rent");
    const serious = async () =>
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        ({ impact }) => impact === "serious" || impact === "critical",
      );
    expect(await serious()).toEqual([]);

    await page.getByRole("button", { name: "Move money" }).click();
    await expect(
      page.getByRole("dialog", { name: "Move money" }),
    ).toBeVisible();
    expect(await serious()).toEqual([]);
  });
}
