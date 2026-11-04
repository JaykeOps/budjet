import { useId } from "react";
import type { Money } from "../kernel/money";
import { card } from "./Card";

export const useMoneyText = (money: Money) =>
  `${useId()}: ${card(String(money.minorUnits))}`;
