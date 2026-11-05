import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  addAccount,
  balanceOf,
  createBudget,
  deleteEntry,
  goTo,
  openAccount,
  show,
  startAddingAccount,
  toast,
} from "./helpers";
import { reloadWhenSaved } from "./reload";

async function budgetWithEveryday(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, {
    firstAccount: { name: "Everyday", openingBalance: "1250.50" },
  });
}

function readyToAssign(page: Page) {
  return page.getByRole("status", { name: "Ready to Assign" });
}

async function moreAction(page: Page, account: string, action: string) {
  await page.getByRole("button", { name: `More for ${account}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

test("Add Account explains the Opening Balance and opens the new Account, with no Undo", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  await addAccount(page, { name: "Rainy day", kind: "Savings", holds: "3000" });

  const expectAdded = async () => {
    await expect(balanceOf(page, "Rainy day")).toContainText("$3,000.00");
    await expect(page.getByText(/^Savings$/)).toBeVisible();
    await expect(page.getByText("Not checked yet")).toBeVisible();
  };
  await expectAdded();
  await expect(toast(page).getByRole("button", { name: "Undo" })).toBeHidden();

  await reloadWhenSaved(page);

  await expectAdded();
  await goTo(page, "Budget");
  await expect(readyToAssign(page)).toHaveText(/\$4,250\.50/);
});

test("Add Account's sheet says where the money goes, reads blank as $0.00 and refuses what isn't an amount", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  const sheet = await startAddingAccount(page);
  await expect(
    sheet.getByText(
      "This is its Opening Balance. It goes to Ready to Assign, for you to give every dollar a job.",
    ),
  ).toBeVisible();
  await sheet.getByLabel("Name").fill("Wallet");
  await sheet.getByLabel("What it holds today").fill("lots");
  await sheet.getByRole("button", { name: "Add Account" }).click();
  await expect(sheet.getByRole("alert")).toContainText("isn't an amount");

  await sheet.getByLabel("What it holds today").fill("");
  await sheet.getByRole("button", { name: "Add Account" }).click();

  await expect(balanceOf(page, "Wallet")).toContainText("$0.00");
});

test("It matches records a Balance check: nothing moves, and the history shows it", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  await openAccount(page, "Everyday");
  await expect(
    page.getByText("Does $1,250.50 match what your bank says?"),
  ).toBeVisible();

  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00"));
  await page.getByRole("button", { name: "It matches" }).click();
  await expect(toast(page)).toContainText("Everyday matches your bank");

  const expectChecked = async () => {
    await expect(page.getByText("Checked Oct 18")).toBeVisible();
    const check = page
      .getByRole("table", { name: "History of Everyday" })
      .getByRole("row", { name: /Balance checked/ });
    await expect(check).toContainText("Matched your bank at $1,250.50");
    await expect(check).toContainText("Oct 18");
    await expect(balanceOf(page, "Everyday")).toContainText("$1,250.50");
  };
  await expectChecked();
  await reloadWhenSaved(page);
  await expectChecked();
  await goTo(page, "Budget");
  await expect(readyToAssign(page)).toHaveText(/\$1,250\.50/);
});

test("It's different says what will happen before saving, or that nothing changes", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  await openAccount(page, "Everyday");
  await page.getByRole("button", { name: "It's different" }).click();
  const bank = page.getByLabel("What your bank says Everyday holds");
  await expect(bank).toHaveValue("1250.50");
  await expect(page.getByText("Nothing changes.")).toBeVisible();

  await bank.fill("1198");
  await expect(
    page.getByText(
      "Crownkeep records an Adjustment of −$52.50. It comes out of Ready to Assign.",
    ),
  ).toBeVisible();
  await bank.fill("1300");
  await expect(
    page.getByText(
      "Crownkeep records an Adjustment of +$49.50. It goes into Ready to Assign.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Update balance" }).click();

  await expect(toast(page)).toContainText("Everyday is now $1,300.00");
  await expect(balanceOf(page, "Everyday")).toContainText("$1,300.00");
  const adjustment = page
    .getByRole("table", { name: "History of Everyday" })
    .getByRole("row", { name: /^Adjustment/ });
  await expect(adjustment).toContainText(
    /You updated the balance to \$1,300\.00.*\+\$49\.50/,
  );
  await goTo(page, "Budget");
  await expect(readyToAssign(page)).toHaveText(/\$1,300\.00/);
});

test("saying it's different and changing nothing records nothing", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  await openAccount(page, "Everyday");
  await page.getByRole("button", { name: "It's different" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("button", { name: "It matches" })).toBeVisible();
  await expect(page.getByText("Not checked yet")).toBeVisible();
  await expect(toast(page)).toBeEmpty();
});

test("a Balance check and an Adjustment can be undone from their toast", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  await openAccount(page, "Everyday");
  const undo = toast(page).getByRole("button", { name: "Undo" });

  await page.getByRole("button", { name: "It matches" }).click();
  await undo.click();
  await expect(page.getByText("Not checked yet")).toBeVisible();
  await expect(page.getByRole("row", { name: /Balance checked/ })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "It's different" }).click();
  await page.getByLabel(/What your bank says/).fill("10");
  await page.getByRole("button", { name: "Update balance" }).click();
  await expect(balanceOf(page, "Everyday")).toContainText("$10.00");
  await undo.click();
  await expect(balanceOf(page, "Everyday")).toContainText("$1,250.50");
  await expect(toast(page)).toBeEmpty();
});

test("a user deletes a mistaken Adjustment and Balance check, and the balance and Ready to Assign follow", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  await openAccount(page, "Everyday");
  const history = page.getByRole("table", { name: "History of Everyday" });
  const deleteRow = async (name: RegExp) => {
    await deleteEntry(page, history.getByRole("row", { name }));
  };

  // No row offers a way to delete the Opening Balance.
  await expect(
    history
      .getByRole("row", { name: /Opening Balance/ })
      .getByRole("button", { name: /^More/ }),
  ).toHaveCount(0);

  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00"));
  await page.getByRole("button", { name: "It matches" }).click();
  await page.clock.setFixedTime(new Date("2026-10-20T12:00:00"));
  await page.getByRole("button", { name: "It's different" }).click();
  await page.getByLabel(/What your bank says/).fill("1300");
  await page.getByRole("button", { name: "Update balance" }).click();
  await expect(balanceOf(page, "Everyday")).toContainText("$1,300.00");

  await deleteRow(/^Adjustment/);

  const expectAdjustmentGone = async () => {
    await expect(
      history.getByRole("row", { name: /Balance checked/ }),
    ).toHaveCount(1);
    await expect(history.getByRole("row", { name: /^Adjustment/ })).toHaveCount(
      0,
    );
    await expect(balanceOf(page, "Everyday")).toContainText("$1,250.50");
    await expect(page.getByText("Checked Oct 18")).toBeVisible();
  };
  await expectAdjustmentGone();
  await reloadWhenSaved(page);
  await expectAdjustmentGone();

  await deleteRow(/Balance checked/);

  await expect(
    history.getByRole("row", { name: /Balance checked/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Not checked yet")).toBeVisible();
  await goTo(page, "Budget");
  await expect(readyToAssign(page)).toHaveText(/\$1,250\.50/);
});

test("Rename changes the name everywhere, with Undo", async ({ page }) => {
  await budgetWithEveryday(page);
  await openAccount(page, "Everyday");

  await moreAction(page, "Everyday", "Rename");
  const sheet = page.getByRole("dialog", { name: "Rename Everyday" });
  await expect(sheet.getByLabel("Name")).toHaveValue("Everyday");
  await sheet.getByLabel("Name").fill("Bills");
  await sheet.getByRole("button", { name: "Rename" }).click();

  await expect(page.getByRole("heading", { name: "Bills" })).toBeVisible();
  await expect(toast(page)).toContainText("Renamed to Bills");
  await expect(
    page.getByRole("table", { name: "History of Bills" }),
  ).toBeVisible();

  await toast(page).getByRole("button", { name: "Undo" }).click();

  await expect(page.getByRole("heading", { name: "Everyday" })).toBeVisible();
  await reloadWhenSaved(page);
  await expect(page.getByRole("heading", { name: "Everyday" })).toBeVisible();
});

test("dismissing Rename brings focus back to More", async ({ page }) => {
  await budgetWithEveryday(page);
  await openAccount(page, "Everyday");

  await moreAction(page, "Everyday", "Rename");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "More for Everyday" }),
  ).toBeFocused();
});

test("Close Account with money offers a pre-filled Transfer, then closes at zero with no Undo", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  await addAccount(page, { name: "Wallet", holds: "116.25" });

  await moreAction(page, "Wallet", "Close Account");
  const closing = page.getByRole("dialog", { name: "Close Wallet" });
  await expect(
    closing.getByText(
      "Wallet holds $116.25. Transfer it to another Account first, then close Wallet.",
    ),
  ).toBeVisible();
  await closing.getByRole("button", { name: "Transfer $116.25" }).click();

  const moving = page.getByRole("dialog", { name: "Transfer money" });
  await expect(moving.getByLabel("Amount")).toHaveValue("116.25");
  await expect(moving.getByLabel("From").locator("option:checked")).toHaveText(
    "Wallet",
  );
  await expect(moving.getByLabel("To").locator("option:checked")).toHaveText(
    "Everyday",
  );
  await moving.getByRole("button", { name: "Transfer $116.25" }).click();
  await expect(balanceOf(page, "Wallet")).toContainText("$0.00");

  await moreAction(page, "Wallet", "Close Account");
  await expect(
    closing.getByText(
      "Its history stays, and it takes no new Transactions or Transfers. You can't open it again.",
    ),
  ).toBeVisible();
  await closing.getByRole("button", { name: "Close Wallet" }).click();

  await expect(closing).toBeHidden();
  await expect(toast(page)).toContainText("Closed Wallet");
  await expect(toast(page).getByRole("button", { name: "Undo" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Wallet" })).toBeFocused();
});

test("a closed Account's page only reads, and Activity's picker still reaches it", async ({
  page,
}) => {
  await budgetWithEveryday(page);
  await addAccount(page, { name: "Old" });
  await moreAction(page, "Old", "Close Account");
  await page.getByRole("button", { name: "Close Old" }).click();

  const expectClosed = async () => {
    await expect(
      page.getByText(
        "Closed. Its history stays here, and it takes no new Transactions or Transfers.",
      ),
    ).toBeVisible();
    await expect(balanceOf(page, "Old")).toContainText("$0.00");
    await expect(page.getByText(/match what your bank says/)).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Transfer money" }),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: /^More/ })).toHaveCount(0);
    await expect(
      page
        .getByRole("table", { name: "History of Old" })
        .getByRole("row", { name: /Opening Balance/ }),
    ).toBeVisible();
  };
  await expectClosed();
  await reloadWhenSaved(page);
  await expectClosed();

  await goTo(page, "Activity");
  await show(page, { account: "Old (closed)" }, "Show 1 entry");
  await expect(page.getByText(/^Closed\. Its history stays/)).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`an Account's page and its sheets have no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await budgetWithEveryday(page);
    await addAccount(page, { name: "Wallet", holds: "20" });
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
    };

    await openAccount(page, "Wallet");
    await scan();

    await page.getByRole("button", { name: "It's different" }).click();
    await page.getByLabel(/What your bank says/).fill("10");
    await scan();
    await page.getByRole("button", { name: "Update balance" }).click();
    await expect(toast(page)).toContainText("Wallet is now");
    await scan();

    await page.getByRole("button", { name: "Transfer money" }).click();
    await page
      .getByRole("dialog", { name: "Transfer money" })
      .getByLabel("Amount")
      .fill("5");
    await scan();
    await page.keyboard.press("Escape");

    await moreAction(page, "Wallet", "Rename");
    await scan();
    await page.keyboard.press("Escape");

    await moreAction(page, "Wallet", "Close Account");
    await scan();
    await page.keyboard.press("Escape");
  });
}
