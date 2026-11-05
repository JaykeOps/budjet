import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { addAccount, createBudget, goTo, toast } from "./helpers";

function card(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

test("the Accounts tab has the total, then a card per Account leading with the check", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, {
    firstAccount: { name: "Everyday", openingBalance: "1000" },
  });
  await addAccount(page, { name: "Wallet", holds: "50.25" });
  await goTo(page, "Accounts");

  await expect(
    page.getByRole("status", { name: "Money in your Accounts" }),
  ).toHaveText("$1,050.25");
  await expect(
    page.getByText("Every dollar here is in your Budget."),
  ).toBeVisible();
  await expect(card(page, "Everyday")).toContainText("$1,000.00");
  await expect(card(page, "Wallet")).toContainText("$50.25");
  await expect(card(page, "Wallet")).toContainText("Not checked yet");

  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00"));
  await card(page, "Wallet")
    .getByRole("button", { name: "Matches my bank" })
    .click();
  await expect(card(page, "Wallet")).toContainText("Checked Oct 18");
  await expect(toast(page)).toContainText("Wallet matches your bank");

  await card(page, "Everyday").getByRole("button", { name: "Update" }).click();
  const bank = page.getByLabel("What your bank says Everyday holds");
  await expect(bank).toBeFocused();
  await bank.fill("900");
  await expect(
    page.getByText(
      "Crownkeep records an Adjustment of −$100.00. It comes out of Ready to Assign.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Update balance" }).click();
  await expect(card(page, "Everyday")).toContainText("$900.00");
  await expect(
    page.getByRole("status", { name: "Money in your Accounts" }),
  ).toHaveText("$950.25");
});

test("tapping an Account drills in, with a way back", async ({ page }) => {
  await createBudget(page, { firstAccount: { name: "Everyday" } });
  await goTo(page, "Accounts");

  await page.getByRole("button", { name: /^Everyday/ }).click();

  await expect(
    page.getByRole("heading", { name: "Everyday", level: 1 }),
  ).toBeFocused();
  await expect(
    page.getByRole("table", { name: "History of Everyday" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "‹ Accounts" }).click();
  await expect(
    page.getByRole("heading", { name: "Accounts", level: 1 }),
  ).toBeVisible();
});

test("closed Accounts fold at the bottom and can still be read", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { name: "Everyday" } });
  await addAccount(page, { name: "Old" });
  await page.getByRole("button", { name: /^More for Old/ }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Old" }).click();
  await goTo(page, "Accounts");

  await expect(card(page, "Old")).toHaveCount(0);
  const old = page.getByRole("button", { name: /^Old/ });
  await expect(old).toBeHidden();

  await page.getByText("Closed Accounts (1)").click();
  await old.click();

  await expect(page.getByText(/^Closed\. Its history stays/)).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the Accounts tab and Add Account have no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await createBudget(page);
    await goTo(page, "Accounts");
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
    };

    await scan();

    await page.getByRole("button", { name: "Add Account" }).click();
    await expect(
      page.getByRole("dialog", { name: "Add Account" }),
    ).toBeVisible();
    await scan();
  });
}
