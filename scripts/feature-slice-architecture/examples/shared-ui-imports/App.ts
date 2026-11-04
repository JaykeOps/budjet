import { useAccountBalance } from "./slices/accounts";
import { card } from "./ui/Card";

export const useApp = (
  record: Parameters<typeof useAccountBalance>[0],
): string => card(useAccountBalance(record));
