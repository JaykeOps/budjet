import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  addAccount,
  assign,
  budgetRow,
  createBudget,
  finishEditing,
  goTo,
  openAccount,
  show,
  startEditing,
  toast,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

function recordButton(page: Page) {
  return page
    .getByRole("navigation", { name: "Places" })
    .getByRole("button", { name: "Record" });
}

/** Found even with a list open, which hides the rest of the page from assistive technology. */
function row(page: Page) {
  return page.getByRole("form", { name: "Record", includeHidden: true });
}

const payee = (page: Page) =>
  row(page).getByRole("combobox", { name: "Payee", includeHidden: true });
const category = (page: Page) =>
  row(page).getByRole("combobox", {
    name: /^(Category|Goes to)$/,
    includeHidden: true,
  });
const amount = (page: Page) => row(page).getByLabel("Amount");
const date = (page: Page) => row(page).getByLabel("Date");
const account = (page: Page) => row(page).getByLabel("Account");
const options = (page: Page) => page.getByRole("listbox").getByRole("option");
const option = (page: Page, name: string) =>
  options(page).filter({ hasText: new RegExp(`^${name}\\b`) });

function history(page: Page, name = "All Accounts") {
  return page.getByRole("table", { name: `History of ${name}` });
}

test("Record from the Budget goes to All Accounts, with a way back to the Budget", async ({
  page,
}) => {
  await createBudget(page);

  await recordButton(page).click();

  await expect(
    page.getByRole("region", { name: "All Accounts" }),
  ).toBeVisible();
  await expect(payee(page)).toBeFocused();
  await expect(account(page)).toHaveValue(/.+/);
  await expect(date(page)).toHaveValue("2026-10-15");

  await page.getByRole("button", { name: "‹ Back to Budget" }).click();

  await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
  await expect(row(page)).toBeHidden();
});

test("Alt+N starts recording from anywhere, and an Account's page makes that Account the default", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });

  await page.keyboard.press("Alt+n");

  await expect(payee(page)).toBeFocused();
  await expect(history(page, "Savings")).toBeVisible();
  await expect(account(page).locator("option:checked")).toContainText(
    "Savings",
  );
  await expect(
    page.getByRole("button", { name: "‹ Back to Budget" }),
  ).toBeHidden();
});

test("the row stays in view above a long history", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  for (const typed of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
    await amount(page).fill(typed);
    await amount(page).press("+");
    await amount(page).press("Enter");
  }

  const box = await row(page).boundingBox();
  const historyBox = await history(page).boundingBox();
  expect(box?.y).toBeLessThan(historyBox?.y ?? 0);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);

  await expect(payee(page)).toBeInViewport();
});

test("Tab goes Payee, Category, Amount, Date, Account", async ({ page }) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await expect(payee(page)).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(category(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(amount(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(date(page)).toBeFocused();
  // A date field keeps Tab for its own month, day, year and calendar.
  for (let inside = 0; inside < 4; inside++) await page.keyboard.press("Tab");
  await expect(account(page)).toBeFocused();
});

test("Category narrows as you type, and each option has Available now and after", async ({
  page,
}) => {
  await createBudget(page);
  await assign(page, "Groceries", "100");
  await page.keyboard.press("Alt+n");
  await amount(page).fill("30");

  await category(page).focus();
  await expect(options(page)).not.toHaveCount(1);
  await page.keyboard.type("gro");

  await expect(options(page)).toHaveCount(1);
  await expect(option(page, "Groceries")).toContainText("$100.00");
  await expect(option(page, "Groceries")).toContainText("$70.00");

  await page.keyboard.press("Enter");

  await expect(category(page)).toHaveValue("Groceries");
  await expect(amount(page)).toBeFocused();
  await expect(row(page)).toContainText("Groceries after this: $70.00 left");
});

async function aBudgetWithCarWashBeforeCar(page: Page) {
  await createBudget(page, { categories: "Start blank" });
  await goTo(page, "Budget");
  await startEditing(page);
  await page.getByRole("button", { name: "Add a Category Group" }).click();
  const group = page.getByRole("textbox", { name: "Add a Category Group" });
  await group.fill("Transport");
  await group.press("Enter");
  await group.blur();
  await page
    .getByRole("button", { name: "Add a Category to Transport" })
    .click();
  const added = page.getByRole("textbox", {
    name: "Add a Category to Transport",
  });
  await added.fill("Car wash");
  await added.press("Enter");
  await added.fill("Car");
  await added.press("Enter");
  await finishEditing(page);
}

test("typing a Category's whole name prefers it to a longer one listed first", async ({
  page,
}) => {
  await aBudgetWithCarWashBeforeCar(page);
  await page.keyboard.press("Alt+n");

  await category(page).focus();
  await page.keyboard.type("car");

  const car = options(page).filter({ hasText: /^Car(?! wash)/ });
  const carWash = options(page).filter({ hasText: /^Car wash/ });
  await expect(car).toHaveAttribute("data-focused", "true");
  await expect(carWash).not.toHaveAttribute("data-focused", "true");

  await page.keyboard.press("Enter");
  await expect(category(page)).toHaveValue("Car");
});

test("a space after a Category's name still finds it", async ({ page }) => {
  await aBudgetWithCarWashBeforeCar(page);
  await page.keyboard.press("Alt+n");

  await category(page).focus();
  await page.keyboard.type("car ");

  await expect(
    options(page).filter({ hasText: /^Car(?! wash)/ }),
  ).toHaveAttribute("data-focused", "true");

  await page.keyboard.press("Enter");
  await expect(category(page)).toHaveValue("Car");
});

test("arrows move through the Categories and Enter picks one", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");

  await category(page).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(category(page)).toHaveValue("Power");
});

test("+ and - switch direction, and the line below follows", async ({
  page,
}) => {
  await createBudget(page);
  await assign(page, "Groceries", "10");
  await page.keyboard.press("Alt+n");
  await expect(row(page)).toContainText(
    "Choose a Category to see what it has left.",
  );
  await category(page).fill("Groceries");
  await page.keyboard.press("Enter");
  await amount(page).pressSequentially("18-");

  await expect(amount(page)).toHaveValue("18");
  await expect(row(page)).toContainText(
    "Groceries after this: Overspent by $8.00",
  );

  await amount(page).press("+");

  await expect(
    row(page).getByRole("button", { name: /^Money in/ }),
  ).toBeVisible();
  await expect(category(page)).toHaveValue("Ready to Assign");
  await expect(row(page)).toContainText(
    "Ready to Assign after this: $1,008.00",
  );

  await amount(page).press("-");

  await expect(
    row(page).getByRole("button", { name: /^Money out/ }),
  ).toBeVisible();
  await expect(category(page)).toHaveValue("");
});

test("the sign beside the Amount switches direction too", async ({ page }) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");

  await row(page)
    .getByRole("button", { name: /^Money out/ })
    .click();

  await expect(
    row(page).getByRole("button", { name: /^Money in/ }),
  ).toBeVisible();
});

test("several Transactions in a row: Enter records, clears the row and returns to Payee, keeping Date and Account", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await page.keyboard.press("Alt+n");
  await date(page).fill("2026-10-03");

  await payee(page).focus();
  await page.keyboard.type("Corner Shop");
  await page.keyboard.press("Tab");
  await page.keyboard.type("gro");
  await page.keyboard.press("Tab");
  await page.keyboard.type("18.50");
  await page.keyboard.press("Enter");

  await expect(toast(page)).toContainText("Recorded −$18.50 at Corner Shop");
  await expect(payee(page)).toBeFocused();
  await expect(payee(page)).toHaveValue("");
  await expect(category(page)).toHaveValue("");
  await expect(amount(page)).toHaveValue("");
  await expect(date(page)).toHaveValue("2026-10-03");
  await expect(account(page).locator("option:checked")).toContainText(
    "Savings",
  );

  await page.keyboard.type("Bus");
  await page.keyboard.press("Tab");
  await page.keyboard.type("transp");
  await page.keyboard.press("Tab");
  await page.keyboard.type("2.75");
  await page.keyboard.press("Enter");

  await page.keyboard.type("Interest");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.type("+4");
  await page.keyboard.press("Enter");

  await expect(toast(page)).toContainText("Recorded +$4.00 at Interest");
  await expect(payee(page)).toBeFocused();
  const rows = history(page, "Savings").getByRole("row");
  await expect(rows.filter({ hasText: "Corner Shop" })).toContainText(
    "Groceries",
  );
  await expect(rows.filter({ hasText: "Bus" })).toContainText("−$2.75");
  await expect(rows.filter({ hasText: "Interest" })).toContainText("+$4.00");
  await expect(rows.filter({ hasText: "Interest" })).toContainText(
    "Ready to Assign",
  );
});

test("Enter with something missing moves to that field and keeps what's typed", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await page.keyboard.type("Corner Shop");

  await page.keyboard.press("Enter");

  await expect(category(page)).toBeFocused();
  await expect(payee(page)).toHaveValue("Corner Shop");
  await page.keyboard.type("gro");
  await page.keyboard.press("Enter");
  await expect(amount(page)).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(amount(page)).toBeFocused();
  await expect(payee(page)).toHaveValue("Corner Shop");
  await expect(category(page)).toHaveValue("Groceries");
  await expect(toast(page)).toBeEmpty();
});

test("money in with a Category that matches nothing stays there and records nothing", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await amount(page).fill("40");
  await amount(page).press("+");
  await expect(category(page)).toHaveValue("Ready to Assign");

  await category(page).focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Rentt");
  await page.keyboard.press("Enter");

  await expect(category(page)).toBeFocused();
  await expect(category(page)).toHaveValue("Rentt");
  await expect(amount(page)).toHaveValue("40");
  await expect(toast(page)).toBeEmpty();
});

test("typing a Category straight after + replaces Ready to Assign", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await amount(page).fill("40");
  await amount(page).focus();

  // Moving on before the field catches up with +, which is otherwise only a few
  // milliseconds: what's selected on arriving has to be Ready to Assign already.
  await amount(page).evaluate(async (input: HTMLInputElement) => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "+",
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
    const field = input.form?.querySelector<HTMLInputElement>(
      '[role="combobox"][placeholder="Type to find one"]',
    );
    field?.focus();
    field?.select();
    await Promise.resolve();
    document.execCommand("insertText", false, "Groceries");
  });

  await expect(category(page)).toHaveValue("Groceries");
  await page.keyboard.press("Enter");
  await expect(row(page).getByText("Groceries after this:")).toBeVisible();
});

for (const [direction, sign, field] of [
  ["in", "+", "Goes to"],
  ["out", "-", "Category"],
] as const) {
  test(`money ${direction}: Enter straight after typing a Category chooses that Category`, async ({
    page,
  }) => {
    await createBudget(page);
    await page.keyboard.press("Alt+n");
    await amount(page).fill("40");
    await amount(page).press(sign);
    await category(page).focus();
    await expect(page.getByRole("listbox")).toBeVisible();

    // Enter arriving before the list has narrowed, which is otherwise only a few
    // milliseconds, so slow machines were the only ones to see this.
    await category(page).evaluate(async (input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "Groceries");
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await Promise.resolve();
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await expect(row(page).getByLabel(field)).toHaveValue("Groceries");
    await expect(row(page).getByText("Groceries after this:")).toBeVisible();
  });
}

test("a known Payee is suggested and fills in its last Category", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await page.keyboard.type("Corner Shop");
  await page.keyboard.press("Tab");
  await page.keyboard.type("gro");
  await page.keyboard.press("Tab");
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");

  await page.keyboard.type("Cor");
  await option(page, "Corner Shop").click();

  await expect(payee(page)).toHaveValue("Corner Shop");
  await expect(category(page)).toHaveValue("Groceries");
});

/** Records a Corner Shop Transaction in Groceries, so the row knows that Payee, and starts on the next. */
async function knowCornerShop(page: Page) {
  await page.keyboard.type("Corner Shop");
  await page.keyboard.press("Tab");
  await page.keyboard.type("gro");
  await page.keyboard.press("Tab");
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await expect(payee(page)).toBeFocused();
}

test("typing a Category straight after a known Payee fills one replaces it", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await knowCornerShop(page);

  // Moving on before the field catches up with the Payee, which is otherwise only
  // a few milliseconds: what's selected on arriving has to be its Category already.
  await payee(page).evaluate(async (input: HTMLInputElement) => {
    document.execCommand("insertText", false, "Corner Shop");
    await Promise.resolve();
    const field = input.form?.querySelector<HTMLInputElement>(
      '[role="combobox"][placeholder="Type to find one"]',
    );
    field?.focus();
    field?.select();
    await Promise.resolve();
    document.execCommand("insertText", false, "Rent");
  });

  await expect(category(page)).toHaveValue("Rent");
  await page.keyboard.press("Enter");
  await expect(row(page).getByText("Rent after this:")).toBeVisible();
  await expect(category(page)).toHaveValue("Rent");
});

test("Activity narrowed to an Account makes that Account the default", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await goTo(page, "Activity");
  await show(page, { account: "Savings" });

  await recordButton(page).click();

  await expect(history(page, "Savings")).toBeVisible();
  await expect(account(page).locator("option:checked")).toContainText(
    "Savings",
  );
});

test("Record on a closed Account's page goes to All Accounts", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Old" });
  await page.getByRole("button", { name: /^More for Old/ }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Old" }).click();

  await recordButton(page).click();

  await expect(history(page)).toBeVisible();
  await expect(account(page).locator("option:checked")).toContainText(
    "Checking",
  );
});

test("Payees used before are still suggested after a reload", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await page.keyboard.type("Employer");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.type("+2000");
  await page.keyboard.press("Enter");
  await expect(
    history(page).getByRole("row", { name: /Employer/ }),
  ).toBeVisible();

  await reloadWhenSaved(page);
  await expect(history(page)).toBeVisible();
  await page.keyboard.press("Alt+n");
  await page.keyboard.type("Emp");

  await expect(option(page, "Employer")).toBeVisible();
});

test("Done and Esc close the row and focus returns to Record", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");

  await row(page).getByRole("button", { name: "Done" }).click();

  await expect(row(page)).toBeHidden();
  await expect(recordButton(page)).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(payee(page)).toBeFocused();
  await page.keyboard.type("Corner");

  await page.keyboard.press("Escape");

  await expect(row(page)).toBeHidden();
  await expect(recordButton(page)).toBeFocused();
});

test("Esc on an open list of Categories only closes the list", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await category(page).focus();
  await expect(options(page).first()).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(options(page)).toHaveCount(0);
  await expect(row(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row(page)).toBeHidden();
});

test("Alt+N with the row open goes back to Payee and keeps what's typed", async ({
  page,
}) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await page.keyboard.type("Corner");
  await amount(page).focus();

  await page.keyboard.press("Alt+n");

  await expect(payee(page)).toBeFocused();
  await expect(payee(page)).toHaveValue("Corner");
});

test("Done closes the row even with a list open", async ({ page }) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");
  await category(page).focus();
  await expect(options(page).first()).toBeVisible();

  await row(page)
    .getByRole("button", { name: "Done", includeHidden: true })
    .click();

  await expect(row(page)).toBeHidden();
  await expect(recordButton(page)).toBeFocused();
});

test("leaving for another place closes the row", async ({ page }) => {
  await createBudget(page);
  await page.keyboard.press("Alt+n");

  await goTo(page, "Budget");
  await goTo(page, "Activity");

  await expect(row(page)).toBeHidden();
});

test("the row hasn't opened behind a sheet", async ({ page }) => {
  await createBudget(page);
  await page.getByRole("button", { name: "+ Add Account" }).click();

  await page.keyboard.press("Alt+n");
  await page.getByRole("dialog", { name: "Add Account" }).press("Escape");

  await expect(row(page)).toBeHidden();
});

test("a switch swaps to a Transfer, and Enter makes it and clears the Amount", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await openAccount(page, "Checking");
  await page.keyboard.press("Alt+n");

  await row(page).getByRole("button", { name: "Transfer" }).click();

  await expect(payee(page)).toBeHidden();
  await expect(
    row(page).getByLabel("From").locator("option:checked"),
  ).toContainText("Checking");
  await expect(
    row(page).getByLabel("To").locator("option:checked"),
  ).toContainText("Savings");
  await expect(date(page)).toHaveValue("2026-10-15");

  await amount(page).focus();
  await page.keyboard.press("Enter");
  await expect(amount(page)).toBeFocused();
  await expect(toast(page)).not.toContainText("Transfer made");

  await page.keyboard.type("200");
  await expect(row(page)).toContainText(
    "Checking goes to $800.00, Savings to $700.00. Categories and Ready to Assign don't change.",
  );
  await page.keyboard.press("Enter");

  await expect(toast(page)).toContainText("Transfer made");
  await expect(amount(page)).toHaveValue("");
  await expect(amount(page)).toBeFocused();
  await expect(history(page, "Checking").getByRole("row").nth(1)).toContainText(
    /To Savings.*−\$200\.00/,
  );
});

test("Transfer money opens the row as a Transfer from that Account", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });

  await page.getByRole("button", { name: "Transfer money" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(amount(page)).toBeFocused();
  await expect(
    row(page).getByLabel("From").locator("option:checked"),
  ).toContainText("Savings");
  await expect(
    row(page).getByLabel("To").locator("option:checked"),
  ).toContainText("Checking");
});

test("From and To are never the same Account", async ({ page }) => {
  await createBudget(page);
  await addAccount(page, { name: "Savings", holds: "500" });
  await page.getByRole("button", { name: "Transfer money" }).click();
  const from = row(page).getByLabel("From");
  await from.selectOption({ index: 0 });

  await expect(from.locator("option:checked")).toContainText("Checking");
  await expect(
    row(page).getByLabel("To").locator("option:checked"),
  ).toContainText("Savings");
  await expect(row(page).getByLabel("To").getByRole("option")).toHaveCount(1);
});

test("with one Account there's nowhere to Transfer to, and the row says so", async ({
  page,
}) => {
  await createBudget(page);
  await openAccount(page, "Checking");
  await page.getByRole("button", { name: "Transfer money" }).click();
  await amount(page).fill("10");

  await expect(row(page)).toContainText(
    "There's no other Account to transfer to yet.",
  );
  await amount(page).press("Enter");

  await expect(toast(page)).not.toContainText("Transfer made");
});

test("Close Account's Transfer opens the row pre-filled, and closing goes on to work", async ({
  page,
}) => {
  await createBudget(page);
  await addAccount(page, { name: "Wallet", holds: "116.25" });
  await page.getByRole("button", { name: /^More for Wallet/ }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();

  await page.getByRole("button", { name: "Transfer $116.25" }).click();

  await expect(amount(page)).toHaveValue("116.25");
  await expect(
    row(page).getByLabel("From").locator("option:checked"),
  ).toContainText("Wallet");
  await expect(
    row(page).getByLabel("To").locator("option:checked"),
  ).toContainText("Checking");
  await expect(amount(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status", { name: "Balance of Wallet" }),
  ).toContainText("$0.00");

  await page.getByRole("button", { name: /^More for Wallet/ }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Wallet" }).click();

  await expect(row(page)).toBeHidden();
});

test("what the row records reaches the Budget", async ({ page }) => {
  await createBudget(page);
  await assign(page, "Groceries", "100");
  await page.keyboard.press("Alt+n");
  await category(page).fill("gro");
  await page.keyboard.press("Enter");
  await page.keyboard.type("30");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: "‹ Back to Budget" }).click();

  await expect(budgetRow(page, "Groceries")).toContainText("$70.00");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the row has no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await createBudget(page);
    const scan = async (axe = new AxeBuilder({ page })) => {
      const { violations } = await axe.analyze();
      expect(
        violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
    };

    await page.keyboard.press("Alt+n");
    await amount(page).fill("20");
    await scan();
    await category(page).focus();
    await expect(options(page).first()).toBeVisible();
    // React Aria hides the page from assistive technology while a list is open, focusable or not.
    await scan(new AxeBuilder({ page }).disableRules("aria-hidden-focus"));
    await page.keyboard.type("gro");
    await page.keyboard.press("Enter");
    await scan();
    await row(page).getByRole("button", { name: "Transfer" }).click();
    await scan();
  });
}
