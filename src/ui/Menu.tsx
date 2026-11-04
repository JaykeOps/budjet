import {
  Menu as AriaMenu,
  Button,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import styles from "./Menu.module.css";

export type MenuAction = { label: string; onAction: () => void };

/**
 * A "More" button that opens a list of actions. `label` names the button for
 * assistive technology and starts with "More", so what's spoken matches what's
 * shown, e.g. "More for Rent".
 */
export function Menu({
  label,
  actions,
}: {
  label: string;
  actions: readonly MenuAction[];
}) {
  return (
    <MenuTrigger>
      <Button aria-label={label}>More</Button>
      <Popover className={styles.popover}>
        <AriaMenu className={styles.menu} aria-label={label}>
          {actions.map(({ label, onAction }) => (
            <MenuItem key={label} className={styles.item} onAction={onAction}>
              {label}
            </MenuItem>
          ))}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}
