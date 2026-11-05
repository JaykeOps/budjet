// [DEBUG-a4f2] temporary: repeats the failing shape, to raise the reproduction rate on CI.
import { test } from "@playwright/test";
import { assign, createBudget, goTo, record } from "./helpers";

for (let i = 0; i < 60; i++) {
  test(`diag race ${i}`, async ({ page }) => {
    await createBudget(page, { firstAccount: { openingBalance: "1000" } });
    await goTo(page, "Budget");
    await assign(page, "Groceries", "100");
    await record(page, { date: "2026-10-03", amount: "20", category: "Groceries" });
    await record(page, { date: "2026-10-05", amount: "32", category: "Groceries", money: "in" });
    await record(page, { date: "2026-11-02", amount: "12", category: "Groceries", money: "in" });
  });
}
