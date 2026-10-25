/** Categories' public interface: queries, the hooks that wrap them, and its UI. */
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { type Category, type CategoryGroup, categoryGroups } from "./queries";

export { CategoryList } from "./CategoryList";
export { type Category, type CategoryGroup, categoryGroups };

export function useCategoryGroups(): CategoryGroup[] {
  return useChangeLogQuery(categoryGroups);
}
