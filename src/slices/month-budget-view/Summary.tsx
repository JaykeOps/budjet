import { useId } from "react";
import type { ChangeRecord } from "../../kernel/change-log";
import { formatMoney, type Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import { useChangeLogQuery } from "../../kernel/use-change-log-query";
import { currentAssignments } from "../assignments/records";
import { useReadyToAssign } from "../budget-totals";
import { Hint } from "./Hint";
import styles from "./MonthBudget.module.css";
import { type SpentChart, spentChart } from "./spent-chart";
import { useSpentThisMonth } from "./spent-this-month";

function anythingAssigned(records: readonly ChangeRecord[]): boolean {
  return [...currentAssignments(records).values()].some(
    ({ assigned }) => assigned && assigned.minorUnits !== 0,
  );
}

function readyToAssignLine(amount: Money, assigned: boolean): string {
  if (amount.minorUnits < 0) {
    return "You've assigned more than you have. Take some back.";
  }
  if (amount.minorUnits === 0) return "Every dollar has a job.";
  return assigned
    ? "Give these dollars a job."
    : "This is the money in your Accounts. Give each dollar a job.";
}

/** The line under Ready to Assign, saying what to do about it. */
export function useReadyToAssignLine(amount: Money): string {
  return readyToAssignLine(amount, useChangeLogQuery(anythingAssigned));
}

/** The Graphite card, the same in both schemes and at any amount. */
export function ReadyToAssign({ onAssign }: { onAssign: () => void }) {
  const labelId = useId();
  const amount = useReadyToAssign();
  const assigned = useChangeLogQuery(anythingAssigned);
  if (!amount) return null;

  return (
    <div className={styles.readyToAssign}>
      <p className={styles.readyToAssignLabel}>
        <span id={labelId}>Ready to Assign</span>{" "}
        <Hint term="Ready to Assign">
          The money in your Accounts that doesn't have a job yet.
        </Hint>
      </p>
      <div className={styles.readyToAssignFoot}>
        <div role="status" aria-labelledby={labelId}>
          <strong className={styles.readyToAssignAmount}>
            {formatMoney(amount)}
          </strong>
          <p className={styles.readyToAssignLine}>
            {readyToAssignLine(amount, assigned)}
          </p>
        </div>
        <button
          type="button"
          className={styles.readyToAssignButton}
          onClick={onAssign}
        >
          Assign
        </button>
      </div>
    </div>
  );
}

export function SpentThisMonthCard({ month }: { month: Month }) {
  const labelId = useId();
  const spent = useSpentThisMonth(month);
  if (!spent) return null;
  const chart = spentChart(spent, month);
  const going = chart.daysToGo === 1 ? "1 day" : `${chart.daysToGo} days`;

  return (
    <section className={styles.spent} aria-labelledby={labelId}>
      <p className={styles.spentHead}>
        <span id={labelId}>Spent this Month</span>
        <span className={styles.spentFigures}>
          {formatMoney(spent.spent)}
          {spent.spent.minorUnits >= 0 && (
            <span className={styles.muted}>
              {" "}
              of {formatMoney(spent.of)} assigned
            </span>
          )}
        </span>
      </p>
      {spent.daily.length === 0 ? (
        <p className={styles.small}>
          Nothing recorded yet. Spending shows up here as you record it.
        </p>
      ) : (
        <>
          <SpentLine chart={chart} of={spent.of} />
          <p className={styles.small}>
            {chart.daysToGo !== undefined && `${going} to go. `}The dashed line
            is an even pace.
          </p>
        </>
      )}
    </section>
  );
}

const WIDTH = 320;
const HEIGHT = 64;

function SpentLine({ chart, of }: { chart: SpentChart; of: Money }) {
  const { days, running, low, high } = chart;
  const x = (day: number) => (day / days) * WIDTH;
  const y = (minorUnits: number) =>
    HEIGHT - 4 - ((minorUnits - low) / (high - low)) * (HEIGHT - 8);
  const line = running
    .map((total, day) => `${day ? "L" : "M"}${x(day)},${y(total)}`)
    .join(" ");
  const last = running.length - 1;

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Spending day by day, against an even pace"
    >
      <path
        className={styles.chartArea}
        d={`${line} L${x(last)},${y(0)} L0,${y(0)} Z`}
      />
      {low < 0 && (
        <path className={styles.chartZero} d={`M0,${y(0)} L${WIDTH},${y(0)}`} />
      )}
      <path
        className={styles.chartPace}
        d={`M0,${y(0)} L${WIDTH},${y(of.minorUnits)}`}
      />
      <path className={styles.chartLine} d={line} />
      <circle
        className={styles.chartDot}
        cx={x(last)}
        cy={y(running[last])}
        r="4"
      />
    </svg>
  );
}
