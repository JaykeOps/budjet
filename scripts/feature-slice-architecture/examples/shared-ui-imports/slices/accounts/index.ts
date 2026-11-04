import { useMoneyText } from "../../ui/MoneyText";
import type { AccountOpened } from "./records";

export const useAccountBalance = (record: AccountOpened) =>
  useMoneyText(record.balance);
