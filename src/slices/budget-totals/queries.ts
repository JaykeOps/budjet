import { type ChangeRecord, latestBySubject } from "../../kernel/change-log";
import { addMoney, type Money, money, subtractMoney } from "../../kernel/money";
import { type Month, monthOf } from "../../kernel/month";
import { isAccountOpened } from "../accounts/records";
import { isAssignmentSet } from "../assignments/records";
import { isBudgetCreated } from "../budget-setup/records";
import { currentTransactions } from "../transactions/records";

/**
 * The money with no job yet: every Opening Balance and all money coming in
 * with no Category, less every Assignment in every Month. Undefined before a Budget exists. Can go below zero.
 */
export function readyToAssign(
  records: readonly ChangeRecord[],
): Money | undefined {
  const budget = records.findLast(isBudgetCreated);
  if (!budget) return undefined;
  let total = money(0, budget.payload.currency);
  for (const record of records) {
    if (isAccountOpened(record)) {
      total = addMoney(total, record.payload.openingBalance);
    }
  }
  for (const { amount, categoryId } of currentTransactions(records)) {
    if (!categoryId) total = addMoney(total, amount);
  }
  for (const assigned of latestBySubject(
    records.filter(isAssignmentSet),
  ).values()) {
    total = subtractMoney(total, assigned.payload.amount);
  }
  return total;
}

/**
 * The money that went out of a Category in a Month, as a positive amount.
 * Undefined before a Budget exists.
 */
export function spending(
  records: readonly ChangeRecord[],
  categoryId: string,
  of: Month,
): Money | undefined {
  const totals = categoryTotals(records);
  if (!totals) return undefined;
  const spent = totals.categories.get(categoryId)?.spent.get(of) ?? 0;
  return money(spent, totals.currency);
}

/**
 * The money a Category has to spend in a Month: what it carried forward from
 * the previous Month, plus that Month's Assignment, plus money coming in to
 * it, less money going out of it. It carries forward whether positive or
 * negative. Undefined before a Budget exists.
 */
export function available(
  records: readonly ChangeRecord[],
  categoryId: string,
  of: Month,
): Money | undefined {
  const totals = categoryTotals(records);
  if (!totals) return undefined;
  const category = totals.categories.get(categoryId);
  return money(category ? availableIn(category, of) : 0, totals.currency);
}

export type OverspentCategory = { categoryId: string; available: Money };

/**
 * The Categories whose Available is below zero in a Month, by Category id.
 * Budget Totals knows Categories only by id; whoever shows the list orders and
 * names them. Undefined before a Budget exists.
 */
export function overspent(
  records: readonly ChangeRecord[],
  of: Month,
): OverspentCategory[] | undefined {
  const totals = categoryTotals(records);
  if (!totals) return undefined;
  const result: OverspentCategory[] = [];
  for (const [categoryId, category] of totals.categories) {
    const minorUnits = availableIn(category, of);
    if (minorUnits < 0) {
      result.push({
        categoryId,
        available: money(minorUnits, totals.currency),
      });
    }
  }
  return result.sort((a, b) =>
    a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0,
  );
}

/** Each Category's Months in order, with what each Month added to its Available. */
type CategoryMonths = {
  /** Every Month with an Assignment or a Transaction, oldest first. */
  months: Month[];
  /** Available at the end of `months[i]`, in minor units. */
  availableAfter: number[];
  /** Minor units going out in each Month, as a positive number. */
  spent: Map<Month, number>;
};

type CategoryTotals = {
  currency: string;
  categories: Map<string, CategoryMonths>;
};

/**
 * One pass over the records, kept per Change Log snapshot (`readAll` returns
 * the same array until the next append), so every Category row of a Month
 * shares it instead of reading every record again.
 */
const totalsBySnapshot = new WeakMap<
  readonly ChangeRecord[],
  CategoryTotals | undefined
>();

function categoryTotals(
  records: readonly ChangeRecord[],
): CategoryTotals | undefined {
  if (totalsBySnapshot.has(records)) return totalsBySnapshot.get(records);
  const totals = calculateCategoryTotals(records);
  totalsBySnapshot.set(records, totals);
  return totals;
}

function calculateCategoryTotals(
  records: readonly ChangeRecord[],
): CategoryTotals | undefined {
  const budget = records.findLast(isBudgetCreated);
  if (!budget) return undefined;
  const changes = new Map<string, Map<Month, number>>();
  const spent = new Map<string, Map<Month, number>>();
  const add = (
    into: Map<string, Map<Month, number>>,
    categoryId: string,
    of: Month,
    minorUnits: number,
  ) => {
    let months = into.get(categoryId);
    if (!months) {
      months = new Map();
      into.set(categoryId, months);
    }
    months.set(of, (months.get(of) ?? 0) + minorUnits);
  };

  for (const assigned of latestBySubject(
    records.filter(isAssignmentSet),
  ).values()) {
    const { categoryId, month: of, amount } = assigned.payload;
    add(changes, categoryId, of, amount.minorUnits);
  }
  // Many Transactions share a date, so each date is read into a Month once.
  const monthOfDate = new Map<string, Month>();
  for (const { categoryId, date, amount } of currentTransactions(records)) {
    if (!categoryId) continue;
    let of = monthOfDate.get(date);
    if (!of) {
      of = monthOf(date);
      monthOfDate.set(date, of);
    }
    add(changes, categoryId, of, amount.minorUnits);
    if (amount.minorUnits < 0) add(spent, categoryId, of, -amount.minorUnits);
  }

  const categories = new Map<string, CategoryMonths>();
  for (const [categoryId, byMonth] of changes) {
    const months = [...byMonth.keys()].sort();
    let running = 0;
    const availableAfter = months.map(
      (of) => (running += byMonth.get(of) ?? 0),
    );
    categories.set(categoryId, {
      months,
      availableAfter,
      spent: spent.get(categoryId) ?? new Map(),
    });
  }
  return { currency: budget.payload.currency, categories };
}

/** Available at the end of a Month: the running total of the last Month with changes up to it. */
function availableIn(category: CategoryMonths, of: Month): number {
  let low = 0;
  let high = category.months.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (category.months[middle] <= of) low = middle + 1;
    else high = middle;
  }
  return low === 0 ? 0 : category.availableAfter[low - 1];
}
