import { openAccount } from "./slices/accounts/commands";

export const start = () => openAccount("Checking");
