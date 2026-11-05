/** Month Budget view's public interface: its query and UI. It has no records or commands of its own. */
export {
  type AssignInput,
  MonthBudget,
  type MoveMoneyInput,
} from "./MonthBudget";
export type { FirstCategoryChanges } from "./NoCategories";
export {
  type DailySpending,
  type SpentThisMonth,
  spentThisMonth,
} from "./spent-this-month";
