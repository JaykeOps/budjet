import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  activity,
  addFirstAccount,
  createBudget,
  goTo,
  openApp,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

test("setup shows no navigation, and finishing it opens on the Budget", async ({
  page,
}) => {
  const places = page.getByRole("navigation", { name: "Places" });
  await openApp(page);
  await expect(
    page.getByRole("heading", { name: "Create your Budget" }),
  ).toBeVisible();
  await expect(places).toBeHidden();

  await createBudget(page, { firstAccount: null });
  await expect(
    page.getByRole("heading", { name: "Add your first Account" }),
  ).toBeVisible();
  await expect(places).toBeHidden();

  await addFirstAccount(page);
  await expect(places).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Budget", exact: true }),
  ).toBeVisible();
  await expect(activity(page)).toBeHidden();
});

test("each place shows only its own screens", async ({ page }) => {
  await createBudget(page);
  const readyToAssign = page.getByRole("status", { name: "Ready to Assign" });
  const accounts = page.getByRole("region", { name: "Accounts", exact: true });
  const transactions = activity(page);

  await goTo(page, "Activity");
  await expect(readyToAssign).toBeHidden();
  await expect(accounts).toBeHidden();

  await goTo(page, "Accounts");
  await expect(readyToAssign).toBeHidden();
  await expect(transactions).toBeHidden();

  await goTo(page, "Budget");
  await expect(readyToAssign).toBeVisible();
  await expect(accounts).toBeHidden();
  await expect(transactions).toBeHidden();
});

test("a place survives a reload, and Back returns to the one before", async ({
  page,
}) => {
  await createBudget(page);
  const transactions = activity(page);
  await goTo(page, "Activity");

  await reloadWhenSaved(page);
  await expect(transactions).toBeVisible();

  await goTo(page, "Accounts");
  await expect(transactions).toBeHidden();
  await page.goBack();
  await expect(transactions).toBeVisible();
});

test("leaving the Budget and coming back keeps its Month", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page);
  await page.getByRole("button", { name: "Next Month" }).click();
  const november = page.getByRole("table", { name: "November 2026" });
  await expect(november).toBeVisible();

  await goTo(page, "Activity");
  await goTo(page, "Budget");

  await expect(november).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the navigation has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await createBudget(page);
    await expect(
      page.getByRole("navigation", { name: "Places" }),
    ).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .include('nav[aria-label="Places"]')
      .analyze();

    const serious = violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    );
    expect(serious).toEqual([]);
  });
}
