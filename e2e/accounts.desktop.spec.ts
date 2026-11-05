import { expect, test } from "@playwright/test";
import {
  addAccount,
  balanceOf,
  createBudget,
  openAccount,
  transfer,
} from "./helpers";

test("the card, the check and Transfer money stay beside a long history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await createBudget(page, {
    firstAccount: { name: "Everyday", openingBalance: "1000" },
  });
  await addAccount(page, { name: "Wallet" });
  for (const amount of ["1", "2", "3", "4", "5", "6"]) {
    await transfer(page, { from: "Everyday", to: "Wallet", amount });
  }
  await openAccount(page, "Everyday");
  const balance = balanceOf(page, "Everyday");
  const history = page.getByRole("table", { name: "History of Everyday" });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);

  await expect(balance).toBeInViewport();
  const balanceBox = await balance.boundingBox();
  const historyBox = await history.boundingBox();
  expect(balanceBox?.x).toBeGreaterThan(
    (historyBox?.x ?? 0) + (historyBox?.width ?? 0) - 1,
  );
});

test("an Account's page has no back link, because the rail is there", async ({
  page,
}) => {
  await createBudget(page, { firstAccount: { name: "Everyday" } });
  await openAccount(page, "Everyday");

  await expect(page.getByRole("button", { name: "‹ Accounts" })).toBeHidden();
  await expect(
    page
      .getByRole("navigation", { name: "Places" })
      .getByRole("link", { name: /^Everyday/ }),
  ).toHaveAttribute("aria-current", "page");
});

test("Add Account's focus comes back to the rail when the sheet is dismissed", async ({
  page,
}) => {
  await createBudget(page);
  const add = page.getByRole("button", { name: "+ Add Account" });
  await add.click();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Add Account" })).toBeHidden();
  await expect(add).toBeFocused();
});
