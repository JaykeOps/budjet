import { categoryCount } from "../categories";

export const accountCount = (): number => categoryCount() + 1;
