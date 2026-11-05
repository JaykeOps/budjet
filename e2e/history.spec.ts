import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  activity,
  addAccount,
  createBudget,
  goTo,
  show,
  transfer,
} from "./helpers";

/** On 15 October 2026: Everyday and Wallet, with a little history behind them. */
async function budgetWithHistory(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page, {
    firstAccount: { name: "Everyday", openingBalance: "1000" },
  });
  await addAccount(page, { name: "Wallet", holds: "50" });
  await transfer(page, { from: "Everyday", to: "Wallet", amount: "20" });

  await goTo(page, "Activity");
  const record = page.getByRole("form", { name: "Record a Transaction" });
  const income = async (date: string, payee: string, amount: string) => {
    await record.getByLabel("Date").fill(date);
    await record.getByLabel("Money").selectOption("in");
    await record.getByLabel("Amount").fill(amount);
    await record.getByLabel("Payee").fill(payee);
    await record.getByRole("button", { name: "Record Transaction" }).click();
  };
  await income("2026-09-30", "Employer", "300");
  await income("2026-10-03", "Refund", "12.50");
}

test("Activity reads as Statements: this Month open, earlier ones folded, a Transfer once and unsigned", async ({
  page,
}) => {
  await budgetWithHistory(page);
  const history = page.getByRole("table", { name: "History of All Accounts" });

  const october = history.getByRole("button", { name: /^October 2026/ });
  await expect(october).toHaveAccessibleName(
    "October 2026 $1,062.50 in, $0.00 out, ended at $1,362.50",
  );
  await expect(october).toHaveAttribute("aria-expanded", "true");
  const transfer = history.getByRole("row", { name: /Everyday to Wallet/ });
  await expect(transfer).toHaveCount(1);
  await expect(transfer).toContainText("Transfer");
  await expect(transfer).toContainText("$20.00");
  await expect(transfer).not.toContainText("−");
  await expect(transfer).not.toContainText("+");
  await expect(
    history.getByRole("row", { name: /Opening Balance.*Wallet/ }),
  ).toContainText("Ready to Assign, Wallet");

  const september = history.getByRole("button", { name: /^September 2026/ });
  await expect(september).toHaveAccessibleName(
    "September 2026 $300.00 in, $0.00 out, ended at $300.00",
  );
  await expect(september).toHaveAttribute("aria-expanded", "false");
  const employer = history.getByRole("row", { name: /Employer/ });
  await expect(employer).toBeHidden();

  await september.click();
  await expect(employer).toContainText("Ready to Assign, Everyday");

  await october.click();
  await expect(transfer).toBeHidden();
});

test("one Account's Statements sign its Transfers and leave out the rest", async ({
  page,
}) => {
  await budgetWithHistory(page);

  await show(page, { account: "Wallet" }, "Show 2 entries");

  const history = page.getByRole("table", { name: "History of Wallet" });
  await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
  await expect(
    history.getByRole("button", { name: /^October 2026/ }),
  ).toHaveAccessibleName("October 2026 $70.00 in, $0.00 out, ended at $70.00");
  await expect(
    history.getByRole("row", { name: /From Everyday/ }),
  ).toContainText("+$20.00");
  await expect(history.getByRole("row", { name: /Refund/ })).toBeHidden();
});

test("the Showing picker lists every Account and Month, says how many entries it will show, and changes nothing until asked", async ({
  page,
}) => {
  await budgetWithHistory(page);
  const showing = page.getByRole("button", { name: /^Showing:/ });
  await expect(showing).toHaveAccessibleName(
    "Showing: All Accounts, every Month",
  );

  await showing.click();
  const picker = page.getByRole("dialog", { name: "Show" });
  await expect(
    picker.getByRole("radio", { name: "All Accounts" }),
  ).toBeChecked();
  await expect(
    picker.getByRole("radio", { name: "Every Month" }),
  ).toBeChecked();
  await expect(
    picker.getByRole("button", { name: "Show 5 entries" }),
  ).toBeVisible();

  await picker.getByRole("radio", { name: "September 2026" }).check();
  await expect(
    picker.getByRole("button", { name: "Show 1 entry" }),
  ).toBeVisible();
  await picker.getByRole("radio", { name: "Wallet" }).check();
  await expect(
    picker.getByRole("button", { name: "Show 0 entries" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(showing).toBeFocused();
  await expect(showing).toHaveAccessibleName(
    "Showing: All Accounts, every Month",
  );

  await show(page, { month: "September 2026" }, "Show 1 entry");
  await expect(showing).toHaveAccessibleName(
    "Showing: All Accounts, September 2026",
  );
  // A Month asked for by name opens, though it is an earlier one.
  await expect(
    page
      .getByRole("table", { name: "History of All Accounts" })
      .getByRole("row", { name: /Employer/ }),
  ).toBeVisible();

  await show(page, { account: "Wallet" }, "Show 0 entries");
  await expect(
    page.getByText("Nothing here. Try another Month."),
  ).toBeVisible();
});

test("the picker includes a closed Account, whose history stays readable", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00"));
  await createBudget(page);
  await addAccount(page, { name: "Old" });
  await page.getByRole("button", { name: /^More for Old/ }).click();
  await page.getByRole("menuitem", { name: "Close Account" }).click();
  await page.getByRole("button", { name: "Close Old" }).click();

  await goTo(page, "Activity");
  await show(page, { account: "Old (closed)" }, "Show 1 entry");

  await expect(
    page
      .getByRole("table", { name: "History of Old" })
      .getByRole("row", { name: /Opening Balance/ }),
  ).toContainText("$0.00");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Activity, an Account's history and the picker have no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await budgetWithHistory(page);
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
    };

    await expect(activity(page)).toBeVisible();
    await scan();

    await page.getByRole("button", { name: /^Showing:/ }).click();
    await expect(page.getByRole("dialog", { name: "Show" })).toBeVisible();
    await scan();
    await page.keyboard.press("Escape");

    await show(page, { account: "Wallet" });
    await expect(
      page.getByRole("table", { name: "History of Wallet" }),
    ).toBeVisible();
    await scan();
  });
}
