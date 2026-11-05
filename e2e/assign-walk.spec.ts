import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  assign,
  createBudget,
  expectAssigned,
  goTo,
  openCopyPreview,
  record,
} from "./helpers";

test.beforeEach(({ page }) =>
  page.clock.setFixedTime(new Date("2026-10-15T12:00:00")),
);

async function budget(page: Page, openingBalance: string) {
  await createBudget(page, { firstAccount: { openingBalance } });
  await goTo(page, "Budget");
}

const nextMonth = (page: Page) =>
  page.getByRole("button", { name: "Next Month" }).click();

const startWalk = async (page: Page) => {
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  return page.getByRole("dialog", { name: /^Assign / });
};

/** Moves through the walk without saving, naming each Category it asks about. */
async function namesToTheEnd(sheet: Locator): Promise<string[]> {
  const names: string[] = [];
  const end = sheet.getByText("That's every Category.");
  const name = sheet.locator("p[aria-live] strong");
  const field = sheet.getByRole("textbox").first();
  await expect(end.or(field)).toBeVisible();
  while (!(await end.isVisible())) {
    names.push((await name.textContent()) ?? "");
    await field.press("ArrowDown");
    await expect(
      end.or(sheet.getByText(`· ${names.length + 1} of `)),
    ).toBeVisible();
  }
  return names;
}

test("the walk asks about what's Overspent, then what has nothing assigned, and ends on Ready to Assign", async ({
  page,
}) => {
  await budget(page, "1000");
  await assign(page, "Rent", "100");
  await assign(page, "Groceries", "50");
  await record(page, {
    date: "2026-10-03",
    amount: "80",
    category: "Groceries",
  });

  const sheet = await startWalk(page);
  const names = await namesToTheEnd(sheet);

  expect(names[0]).toBe("Groceries");
  expect(names).not.toContain("Rent");
  expect(names.length).toBeGreaterThan(1);
  await expect(sheet).toContainText("Ready to Assign is $850.00.");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
});

test("the walk saves as it goes, with nothing asked about twice", async ({
  page,
}) => {
  await budget(page, "1000");
  const sheet = await startWalk(page);
  const field = sheet.getByRole("textbox", { name: /^Assigned in / });

  await expect(sheet).toContainText(/· 1 of \d+/);
  await field.fill("25");
  await field.press("Enter");
  await expect(sheet).toContainText(/· 2 of \d+/);
  await expect(sheet).toContainText(/Ready to Assign\s*\$975\.00/);
});

test("the walk offers Copy last Month first, with boxes to untick and a live Ready to Assign", async ({
  page,
}) => {
  await budget(page, "2000");
  await assign(page, "Rent", "1200");
  await assign(page, "Groceries", "300");
  await nextMonth(page);
  await assign(page, "Groceries", "250");

  const sheet = await startWalk(page);
  await expect(sheet).toContainText(
    "1 Category has nothing assigned in November yet.",
  );
  await expect(sheet.getByRole("checkbox")).toHaveCount(1);
  const rent = sheet.getByRole("checkbox", { name: /Rent/ });
  await expect(rent).toBeChecked();
  await expect(sheet).toContainText(/Ready to Assign after\s*−\$950\.00/);

  await rent.uncheck();
  await expect(sheet).toContainText(/Ready to Assign after\s*\$250\.00/);
  await expect(sheet.getByRole("button", { name: /^Copy 0/ })).toBeDisabled();

  await rent.check();
  await sheet.getByRole("button", { name: "Copy 1 Assignment" }).click();
  await expect(sheet.getByRole("checkbox")).toHaveCount(0);
  await expect(sheet).toContainText(/Ready to Assign\s*−\$950\.00/);
  await sheet.getByRole("button", { name: "Close" }).click();

  await expectAssigned(page, "Rent", "$1,200.00");
  await expectAssigned(page, "Groceries", "$250.00");
});

test("Not now skips the copy, and nothing is written", async ({ page }) => {
  await budget(page, "2000");
  await assign(page, "Rent", "1200");
  await nextMonth(page);

  const sheet = await startWalk(page);
  await sheet.getByRole("button", { name: "Not now" }).click();
  await expect(sheet.getByRole("checkbox")).toHaveCount(0);
  await expect(sheet).toContainText(/1 of \d+/);
  await expect(sheet).toContainText(/Ready to Assign\s*\$800\.00/);
});

test("a Category left unticked isn't copied", async ({ page }) => {
  await budget(page, "5000");
  await assign(page, "Rent", "1200");
  await assign(page, "Groceries", "300");
  await nextMonth(page);

  const sheet = await openCopyPreview(page);
  await sheet.getByRole("checkbox", { name: /Groceries/ }).uncheck();
  await sheet.getByRole("button", { name: "Copy 1 Assignment" }).click();
  const close = sheet.getByRole("button", { name: "Close" });
  if (await close.isVisible()) await close.click();

  await expectAssigned(page, "Rent", "$1,200.00");
  await expectAssigned(page, "Groceries", "$0.00");
});

test("below zero, the preview warns, and the walk ends with where to take money back from", async ({
  page,
}) => {
  await budget(page, "1000");
  await assign(page, "Rent", "800");
  await nextMonth(page);
  await assign(page, "Groceries", "25");

  const sheet = await startWalk(page);
  await expect(sheet).toContainText(
    "That's $625.00 more than you have. Untick a Category, or take it back from one afterwards.",
  );
  await sheet.getByRole("button", { name: "Copy 1 Assignment" }).click();

  const names = await namesToTheEnd(sheet);
  // Rent had both Months' money, more Available than Groceries.
  expect(names.slice(-2)).toEqual(["Rent", "Groceries"]);
  await expect(sheet).toContainText("Ready to Assign is −$625.00.");
  await expect(sheet).toContainText(
    "You've assigned more than you have. Take some back.",
  );
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the preview and the walk's end have no serious accessibility violations in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await budget(page, "1000");
    await assign(page, "Rent", "1200");
    await nextMonth(page);

    const sheet = await startWalk(page);
    await expect(sheet).toContainText("more than you have");
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter(({ impact }) =>
          ["serious", "critical"].includes(impact ?? ""),
        ),
      ).toEqual([]);
    };
    await scan();

    await sheet.getByRole("button", { name: "Not now" }).click();
    await namesToTheEnd(sheet);
    await scan();
  });
}
