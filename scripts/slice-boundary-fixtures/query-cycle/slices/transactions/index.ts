import { accountCount } from "../accounts";

export const transactionCount = (): number => accountCount() + 1;
