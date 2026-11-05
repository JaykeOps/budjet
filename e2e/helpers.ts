import { expect, type Locator, type Page } from "@playwright/test";

type FirstAccount = {
  name?: string;
  type?: string;
  openingBalance?: string;
};

type Place = "Budget" | "Activity" | "Accounts";

/**
 * Opens the app unless this test already has. Before a Budget exists the app
 * is only setup, so there is no place to `goTo`.
 */
export async function openApp(page: Page): Promise<void> {
  if (page.url() === "about:blank") {
    await page.goto("/");
  }
}

/**
 * Creates a Budget by walking first run: every spec's way through setup. Any
 * change to the setup steps belongs here, not in the specs.
 */
export async function createBudget(
  page: Page,
  {
    currency = "USD",
    categories = "Use the starter set",
    firstAccount: { name = "Checking", type, openingBalance = "1000" } = {},
  }: {
    currency?: string;
    categories?: "Use the starter set" | "Start blank";
    firstAccount?: FirstAccount;
  } = {},
): Promise<void> {
  await openApp(page);
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Currency").selectOption(currency);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: categories }).click();
  await page.getByLabel("Name").fill(name);
  if (type) {
    await page.getByRole("radio", { name: type }).check();
  }
  await page.getByLabel("What it holds today").fill(openingBalance);
  await page.getByRole("button", { name: "Add Account" }).click();
  await page.getByRole("button", { name: "Open my Budget" }).click();
}

/** Activity on a phone and All Accounts on desktop, which are one screen. */
export function activity(page: Page) {
  return page.getByRole("region", { name: /^(Activity|All Accounts)$/ });
}

/** Narrows Activity through its one "Showing" button, whose button then says how many entries. */
export async function show(
  page: Page,
  { account, month }: { account?: string; month?: string },
  entries?: string,
): Promise<void> {
  await page.getByRole("button", { name: /^Showing:/ }).click();
  const picker = page.getByRole("dialog", { name: "Show" });
  if (account) await picker.getByRole("radio", { name: account }).check();
  if (month) await picker.getByRole("radio", { name: month }).check();
  await picker
    .getByRole("button", { name: entries ?? /^Show \d+ entr/ })
    .click();
  await expect(picker).toBeHidden();
}

/**
 * Reaches a place through whichever navigation this device has: tabs on a
 * phone, the rail on desktop. Until the Accounts screen is rebuilt, the rail
 * reaches it through "+ Add Account".
 */
export async function goTo(page: Page, place: Place): Promise<void> {
  const places = page.getByRole("navigation", { name: "Places" });
  const links = {
    Budget: places.getByRole("link", { name: "Budget", exact: true }),
    Activity: places.getByRole("link", { name: /^(Activity|All Accounts)/ }),
    Accounts: places.getByRole("link", { name: /^(Accounts|\+ Add Account)$/ }),
  };
  const landmarks = {
    Budget: page.getByRole("heading", { name: "Budget", exact: true }),
    Activity: activity(page),
    Accounts: page.getByRole("region", { name: "Accounts", exact: true }),
  };
  await links[place].click();
  await expect(landmarks[place]).toBeVisible();
}

/** A Category's or Category Group's row on the Budget: a list item on a phone, a table row on desktop. */
export function budgetRow(page: Page, name: string): Locator {
  return page
    .getByRole("listitem", { name, exact: true })
    .or(page.getByRole("row", { name: new RegExp(`^${name}\\b`) }));
}

/** The Budget's Category Groups and Categories, in the order they show, in one flat list. */
export function budgetOutline(page: Page): Promise<(string | null)[]> {
  return page
    .getByRole("region", { name: /^\w+ \d{4}$/ })
    .getByRole("heading", { level: 3 })
    .or(page.getByRole("meter"))
    .evaluateAll((found) =>
      found.map(
        (element) =>
          element.getAttribute("aria-label")?.replace("Spending in ", "") ??
          element.textContent,
      ),
    );
}

/** Records a Transaction in Activity and comes back to the Budget. */
export async function record(
  page: Page,
  {
    date,
    amount,
    category,
    money = "out",
  }: { date: string; amount: string; category: string; money?: "in" | "out" },
): Promise<void> {
  await goTo(page, "Activity");
  const form = page.getByRole("form", { name: "Record a Transaction" });
  await form.getByLabel("Date").fill(date);
  await form.getByLabel("Money").selectOption(money);
  await form.getByLabel("Amount").fill(amount);
  await form.getByLabel("Category").selectOption({ label: category });
  await form.getByRole("button", { name: "Record Transaction" }).click();
  await goTo(page, "Budget");
}

/** Gives a Category an Assignment in the Month showing. */
export async function assign(
  page: Page,
  category: string,
  amount: string,
): Promise<void> {
  const field = page.getByLabel(`Assignment for ${category}`);
  await field.fill(amount);
  await field.press("Enter");
}
