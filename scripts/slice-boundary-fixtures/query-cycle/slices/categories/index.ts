import { transactionCount } from "../transactions";

export const categoryCount = (): number => transactionCount() + 1;
