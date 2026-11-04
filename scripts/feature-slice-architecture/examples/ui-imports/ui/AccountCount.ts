import { accountCount } from "../slices/accounts";

export const accountCountText = () => String(accountCount());
