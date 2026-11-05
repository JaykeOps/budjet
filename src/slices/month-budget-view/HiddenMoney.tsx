import { useCallback, useState } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { OpenableSheet } from "../../ui/Sheet";
import { MoveOutFlow } from "../categories";
import { hiddenWithMoney } from "./hidden-money";
import styles from "./MonthBudget.module.css";

/** Flags each hidden Category holding money in the Month, until Available is $0.00. */
export function HiddenMoney({
  month,
  onMoveOut,
}: {
  month: Month;
  onMoveOut: (
    category: { id: string; name: string },
    other: string | undefined,
  ) => void;
}) {
  const lines = useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => hiddenWithMoney(records, month),
      [month],
    ),
  );
  const [open, setOpen] = useState<string>();
  const target = lines.find(({ id }) => id === open);
  const close = () => setOpen(undefined);

  return (
    <>
      {lines.map(({ id, text, action }) => (
        <p key={id} className={styles.hiddenMoney}>
          <span>{text}</span>
          <button
            type="button"
            className={styles.hiddenMoneyAction}
            onClick={() => setOpen(id)}
          >
            {action}
          </button>
        </p>
      ))}
      {target && (
        <OpenableSheet title={`Sort out ${target.name}`} isOpen onClose={close}>
          {() => (
            <div className={styles.hiddenMoneySheet}>
              <MoveOutFlow
                category={target}
                month={month}
                hide={false}
                onApply={(other) => {
                  onMoveOut(target, other);
                  close();
                }}
                onCancel={close}
              />
            </div>
          )}
        </OpenableSheet>
      )}
    </>
  );
}
