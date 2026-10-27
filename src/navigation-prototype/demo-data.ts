// PROTOTYPE (prototype/navigation): throwaway. A Budget in memory, never saved,
// so every navigation variant opens on the same believable data.
import {
  type ChangeLogWriter,
  createChangeLogWriter,
  createInMemoryChangeLog,
} from "../kernel/change-log";
import { money } from "../kernel/money";
import { currentMonth } from "../kernel/month";
import { openAccount, redeclareBalance } from "../slices/accounts/commands";
import { setAssignment } from "../slices/assignments/commands";
import { createBudget } from "../slices/budget-setup/commands";
import { categoryGroups } from "../slices/categories";
import { addStarterSet } from "../slices/categories/commands";
import { recordTransaction } from "../slices/transactions/commands";
import { makeTransfer } from "../slices/transfers/commands";

export function demoWriter(): ChangeLogWriter {
  const writer = createChangeLogWriter(createInMemoryChangeLog(), "demo");
  const usd = (dollars: number) => money(Math.round(dollars * 100), "USD");
  const month = currentMonth();
  const day = (d: number) => `${month}-${String(d).padStart(2, "0")}`;

  createBudget(writer, { currency: "USD" });
  addStarterSet(writer);
  const checking = openAccount(writer, {
    name: "Everyday Checking",
    kind: "checking",
    openingBalance: usd(3200),
  });
  const savings = openAccount(writer, {
    name: "Rainy Day Savings",
    kind: "savings",
    openingBalance: usd(6500),
  });
  const cash = openAccount(writer, {
    name: "Wallet",
    kind: "cash",
    openingBalance: usd(80),
  });

  const id = Object.fromEntries(
    categoryGroups(writer.changeLog.readAll())
      .flatMap((group) => group.categories)
      .map(({ id, name }) => [name, id]),
  );
  const assigned: Record<string, number> = {
    Rent: 1400,
    Power: 120,
    Phone: 45,
    Internet: 60,
    Groceries: 600,
    Transport: 180,
    "Dining Out": 300,
    "Emergency Fund": 500,
  };
  for (const [name, amount] of Object.entries(assigned)) {
    setAssignment(writer, { categoryId: id[name], month, amount: usd(amount) });
  }

  const spend: [number, string, string, number, string?][] = [
    [1, "Rent", "Landlord", 1400],
    [2, "Groceries", "Trader Joe's", 64.18],
    [3, "Dining Out", "Corner Bistro", 42.3],
    [4, "Transport", "Shell", 48.2],
    [5, "Phone", "Mint Mobile", 45],
    [6, "Groceries", "Farmers market", 23.5, cash],
    [7, "Dining Out", "Corner Bistro", 18.5],
    [8, "Power", "City Power", 112.4],
    [9, "Groceries", "Costco", 187.9],
  ];
  for (const [d, category, payee, amount, account] of spend) {
    recordTransaction(writer, {
      accountId: account ?? checking,
      date: day(d),
      amount: usd(-amount),
      categoryId: id[category],
      payee,
    });
  }
  recordTransaction(writer, {
    accountId: checking,
    date: day(3),
    amount: usd(12),
    categoryId: id.Groceries,
    payee: "Costco",
    memo: "Refund",
  });
  recordTransaction(writer, {
    accountId: checking,
    date: day(5),
    amount: usd(2400),
    payee: "Paycheck",
  });
  makeTransfer(writer, {
    fromAccountId: checking,
    toAccountId: savings,
    date: day(6),
    amount: usd(500),
    memo: "Monthly saving",
  });
  makeTransfer(writer, {
    fromAccountId: checking,
    toAccountId: cash,
    date: day(7),
    amount: usd(60),
  });
  redeclareBalance(writer, cash, { balance: usd(110) });
  return writer;
}
