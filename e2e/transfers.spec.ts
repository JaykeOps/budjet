import { expect, type Page, test } from "@playwright/test";
import {
  addAccount,
  balanceOf,
  createBudget,
  expectBalance,
  goTo,
  hasRail,
  show,
  toast,
  transfer,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

/** A Budget in USD with Checking holding $1,000 and Savings holding $500. */
async function createBudgetWithSavings(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page);
  await addAccount(page, { name: "Savings", kind: "Savings", holds: "500" });
}

test("Undo takes a Transfer back", async ({ page }) => {
  await createBudgetWithSavings(page);
  await transfer(page, { from: "Checking", to: "Savings", amount: "200" });
  await expect(balanceOf(page, "Checking")).toContainText("$800.00");

  await toast(page).getByRole("button", { name: "Undo" }).click();

  await expect(balanceOf(page, "Checking")).toContainText("$1,000.00");
  await expect(toast(page)).toBeEmpty();
  await reloadWhenSaved(page);
  await expect(balanceOf(page, "Checking")).toContainText("$1,000.00");
});

test("a user edits and deletes a Transfer from the history", async ({
  page,
}) => {
  test.skip(!hasRail(page), "edit.phone.spec.ts covers a phone.");
  await createBudgetWithSavings(page);
  await transfer(page, { from: "Checking", to: "Savings", amount: "200" });
  await expect(balanceOf(page, "Checking")).toContainText("$800.00");
  const row = page
    .getByRole("table", { name: "History of Checking" })
    .getByRole("row", { name: /^To Savings/ });
  const more = row.getByRole("button", { name: /^More/ });

  await more.click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Transfer" });
  await expect(edit.getByLabel("Amount")).toHaveValue("200.00");
  await edit.getByLabel("Amount").fill("50");
  await expect(
    edit.getByText("Checking goes to $950.00. Savings goes to $550.00."),
  ).toBeVisible();
  await edit.getByRole("button", { name: "Save changes" }).click();

  await expect(edit).toBeHidden();
  await expect(balanceOf(page, "Checking")).toContainText("$950.00");
  await reloadWhenSaved(page);
  await expect(balanceOf(page, "Checking")).toContainText("$950.00");

  await more.click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(row).toHaveCount(0);
  await expect(balanceOf(page, "Checking")).toContainText("$1,000.00");
  await reloadWhenSaved(page);
  await expectBalance(page, "Savings", "$500.00");
});

test("a Transfer touching a closed Account stays as it is", async ({
  page,
}) => {
  await createBudgetWithSavings(page);
  await transfer(page, { from: "Savings", to: "Checking", amount: "500" });
  await page.getByRole("button", { name: "More for Savings" }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Savings" }).click();

  await expect(
    page
      .getByRole("table", { name: "History of Savings" })
      .getByRole("row", { name: /^To Checking/ })
      .getByRole("button", { name: /^More/ }),
  ).toHaveCount(0);

  await goTo(page, "Activity");
  await show(page, { account: "Checking" });
  await expect(
    page
      .getByRole("table", { name: "History of Checking" })
      .getByRole("row", { name: /^From Savings/ })
      .getByRole("button", { name: /^More/ }),
  ).toHaveCount(0);
});

test("a Transfer's More menu works from the keyboard", async ({ page }) => {
  test.skip(!hasRail(page), "A phone's rows open by tapping.");
  await createBudgetWithSavings(page);
  await transfer(page, { from: "Checking", to: "Savings", amount: "200" });

  const more = page
    .getByRole("table", { name: "History of Checking" })
    .getByRole("button", { name: /^More/ });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more).toBeFocused();
});
