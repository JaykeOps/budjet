import { expect, type Page } from "@playwright/test";

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

/**
 * Reaches a place. Every place is on one screen today, so this only checks it
 * is showing. Navigation changes belong here, not in the specs.
 */
export async function goTo(page: Page, place: Place): Promise<void> {
  const landmarks = {
    Budget: page.getByRole("heading", { name: "Budget", exact: true }),
    Activity: page.getByRole("region", { name: "Transactions", exact: true }),
    Accounts: page.getByRole("region", { name: "Accounts", exact: true }),
  };
  await expect(landmarks[place]).toBeVisible();
}
