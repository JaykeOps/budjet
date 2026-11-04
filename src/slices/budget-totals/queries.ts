import { type ChangeRecord, perSnapshot } from "../../kernel/change-log";
import { addMoney, type Money, money, subtractMoney } from "../../kernel/money";
import { type Month, monthOf } from "../../kernel/month";
import { adjustments } from "../accounts";
import { isAccountOpened } from "../accounts/records";
import { currentAssignments } from "../assignments/records";
import { isBudgetCreated } from "../budget-setup/records";
import { currentTransactions } from "../transactions/records";

/**
 * The money with no job yet: every Opening Balance, every Adjustment and all
 * money coming in with no Category, less every Assignment in every Month, plus
 * every Take-back. Undefined before a Budget exists. Can go below zero.
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
  for (const { amount } of adjustments(records)) {
    total = addMoney(total, amount);
  }
  for (const { amount, categoryId } of currentTransactions(records)) {
    if (!categoryId) total = addMoney(total, amount);
  }
  for (const { assigned, takenBack } of currentAssignments(records).values()) {
    if (assigned) total = subtractMoney(total, assigned);
    if (takenBack) total = addMoney(total, takenBack);
  }
  return total;
}

/**
 * What a Category's Transactions took out of the Budget in a Month: money going
 * out less refunds coming back in, so it is negative when refunds outweigh the
 * money going out. Undefined before a Budget exists.
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
 * the previous Month, less that Month's Take-back, plus its Assignment, plus
 * money coming in to it, less money going out of it. It carries forward whether positive or
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

/**
 * Whether a Category is in use: a Transaction is in it now, or in some Month
 * its Assignment is other than zero now or it has a Take-back. Like a deleted
 * Transaction, an Assignment set and later cleared back to zero leaves no trace.
 */
export function categoryUsed(
  records: readonly ChangeRecord[],
  categoryId: string,
): boolean {
  return (
    [...currentAssignments(records).values()].some(
      (current) =>
        current.categoryId === categoryId &&
        (Boolean(current.assigned?.minorUnits) ||
          Boolean(current.takenBack?.minorUnits)),
    ) ||
    currentTransactions(records).some(
      (transaction) => transaction.categoryId === categoryId,
    )
  );
}

/** Whether a Category has an Assignment other than zero in any Month after `of`. */
export function assignedAfter(
  records: readonly ChangeRecord[],
  categoryId: string,
  of: Month,
): boolean {
  for (const current of currentAssignments(records).values()) {
    if (
      current.categoryId === categoryId &&
      current.month > of &&
      current.assigned?.minorUnits
    ) {
      return true;
    }
  }
  return false;
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
  /** Every Month with an Assignment, a Take-back or a Transaction, oldest first. */
  months: Month[];
  /** Available at the end of `months[i]`, in minor units. */
  availableAfter: number[];
  /** Each Month's Spending in minor units: positive for net money going out. */
  spent: Map<Month, number>;
};

type CategoryTotals = {
  currency: string;
  categories: Map<string, CategoryMonths>;
};

/**
 * One pass over the records, kept per Change Log snapshot, so every Category
 * row of a Month shares it instead of reading every record again.
 */
const categoryTotals = perSnapshot(calculateCategoryTotals);

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

  for (const current of currentAssignments(records).values()) {
    const { categoryId, month: of, assigned, takenBack } = current;
    const minorUnits =
      (assigned?.minorUnits ?? 0) - (takenBack?.minorUnits ?? 0);
    add(changes, categoryId, of, minorUnits);
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
    add(spent, categoryId, of, -amount.minorUnits);
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
