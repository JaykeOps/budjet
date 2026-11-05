import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

/**
 * An empty screen's card: one sentence that teaches, and what to do next.
 * `plain` drops the card, for a screen that is already on one.
 */
export function EmptyState({
  plain = false,
  children,
  actions,
}: {
  plain?: boolean;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className={plain ? styles.plain : styles.card}>
      <p className={styles.text}>{children}</p>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}
