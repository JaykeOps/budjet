import { useCallback, useId, useState } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import { addMoney, formatMoney, type Money } from "../../kernel/money";
import { type Month, monthName } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import styles from "./CategoryEditor.module.css";
import { moveOutChoices } from "./move-out";

/** Words for later Months' Assignments, which only hiding clears. */
function laterNote(
  name: string,
  later: { month: Month; amount: Money }[],
  also: boolean,
): string {
  const total = later.map(({ amount }) => amount).reduce(addMoney);
  const has = `${name}${also ? " also" : ""} has ${formatMoney(total)} assigned`;
  return later.length === 1
    ? `${has} in ${monthName(later[0].month)}. Hiding sets that to $0.00, and it goes back to Ready to Assign.`
    : `${has} across ${later.length} later Months. Hiding sets all of them to $0.00, and it goes back to Ready to Assign.`;
}

/**
 * Asks where a Category's money goes, as one step, either before hiding it or,
 * once hidden, whenever it has gained some. `onApply` gets the Category picked,
 * or undefined for Ready to Assign.
 */
export function MoveOutFlow({
  category: { id, name },
  month,
  hide,
  onApply,
  onCancel,
}: {
  category: { id: string; name: string };
  /** The Month the money moves in. */
  month: Month;
  hide: boolean;
  onApply: (other: string | undefined) => void;
  onCancel: () => void;
}) {
  const choices = useChangeLogQuery(
    useCallback(
      (records: readonly ChangeRecord[]) => moveOutChoices(records, id, month),
      [id, month],
    ),
  );
  const [picked, setPicked] = useState("");
  const pickerId = useId();
  if (!choices) return null;
  const { left, readyToAssign, later, others } = choices;
  const moving = left.minorUnits > 0;
  const hasMoney = left.minorUnits !== 0;
  const size = formatMoney({ ...left, minorUnits: Math.abs(left.minorUnits) });
  const other = others.some(({ id }) => id === picked) ? picked : "";

  return (
    <>
      {hasMoney && (
        <p className={styles.line}>
          <b>{name}</b> {moving ? "has" : "is Overspent by"} <b>{size}</b>
          {moving && " Available"}.
          {hide &&
            ` ${moving ? "Move" : "Cover"} it first, so it isn't left out of sight.`}
        </p>
      )}
      {hasMoney && (
        <>
          <label className={styles.field} htmlFor={pickerId}>
            {moving ? "Move it to" : "Cover it from"}
          </label>
          <select
            id={pickerId}
            value={other}
            onChange={(event) => setPicked(event.target.value)}
          >
            <option value="">
              Ready to Assign ({formatMoney(readyToAssign)})
            </option>
            {others.map(({ id, name, groupName, available }) => (
              <option key={id} value={id}>
                {name}, {groupName} ({formatMoney(available)})
              </option>
            ))}
          </select>
        </>
      )}
      {hide && later.length > 0 && (
        <p className={styles.line}>{laterNote(name, later, hasMoney)}</p>
      )}
      <button
        type="button"
        data-primary
        onClick={() => onApply(other || undefined)}
      >
        {hasMoney
          ? `${moving ? "Move" : "Cover"} ${size}${hide ? " and hide" : ""}`
          : "Set to $0.00 and hide"}
      </button>
      <button type="button" onClick={onCancel}>
        Keep {name} as it is
      </button>
    </>
  );
}
