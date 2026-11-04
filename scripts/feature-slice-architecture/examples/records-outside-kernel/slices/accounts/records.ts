import { appName } from "../../App";
import { card } from "../../ui/Card";
import { accountType } from "./helpers";

export const accountLabel = () => card(`${appName} ${accountType}`);
