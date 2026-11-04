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

export async function addFirstAccount(
  page: Page,
  { name = "Checking", type, openingBalance = "1000" }: FirstAccount = {},
): Promise<void> {
  const setup = page.getByRole("form", { name: "Add your first Account" });
  await setup.getByLabel("Name").fill(name);
  if (type) {
    await setup.getByLabel("Type").selectOption(type);
  }
  await setup.getByLabel("Opening Balance").fill(openingBalance);
  await setup.getByRole("button", { name: "Add Account" }).click();
}

/**
 * Creates a Budget through the UI, with its first Account unless
 * `firstAccount` is null, which stops at the first Account step of setup.
 */
export async function createBudget(
  page: Page,
  {
    currency = "USD",
    firstAccount = {},
  }: { currency?: string; firstAccount?: FirstAccount | null } = {},
): Promise<void> {
  await openApp(page);
  await page.getByLabel("Currency").selectOption(currency);
  await page.getByRole("button", { name: "Create Budget" }).click();
  if (firstAccount) {
    await addFirstAccount(page, firstAccount);
  }
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
    Activity: page.getByRole("region", { name: "Transactions", exact: true }),
    Accounts: page.getByRole("region", { name: "Accounts", exact: true }),
  };
  await links[place].click();
  await expect(landmarks[place]).toBeVisible();
}
