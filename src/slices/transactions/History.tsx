import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { formatMoney, type Money } from "../../kernel/money";
import { currentMonth, type Month, monthName } from "../../kernel/month";
import { Menu, type MenuAction } from "../../ui/Menu";
import { useAccounts } from "../accounts";
import { useCategoryGroups } from "../categories";
import styles from "./History.module.css";
import type { TransactionListEntry } from "./queries";
import type { Statement } from "./statements";

/** Every row is this tall, so the list knows which rows are in view without measuring them. */
const ROW_HEIGHT = 76;
/** Rows rendered beyond each edge of the view, so fast scrolling shows no gaps. */
const OVERSCAN = 10;

type Row =
  | { kind: "statement"; statement: Statement; open: boolean }
  | { kind: "entry"; entry: TransactionListEntry };

/**
 * Month Statements as one list with virtual scrolling: only the rows in view
 * (and a few either side) are rendered, so years of history scroll smoothly.
 * The current Month, any later one and a Month asked for by name start open;
 * earlier ones start folded.
 */
export function History({
  label,
  statements,
  accountId,
  askedMonth,
  actionsFor,
  onOpen,
}: {
  label: string;
  statements: Statement[];
  /** The Account the history is seen from. Without one, each row names its Account. */
  accountId?: string;
  askedMonth?: Month;
  actionsFor: (entry: TransactionListEntry) => MenuAction[];
  /** What tapping a row does on a phone, where it stands in for the More menu. */
  onOpen: (entry: TransactionListEntry) => void;
}) {
  const [folding, setFolding] = useState<ReadonlyMap<Month, boolean>>(
    new Map(),
  );
  const thisMonth = currentMonth();
  const rows: Row[] = statements.flatMap((statement) => {
    const { month, entries } = statement;
    const open =
      folding.get(month) ?? (month >= thisMonth || month === askedMonth);
    return [
      { kind: "statement", statement, open } as const,
      ...(open
        ? entries.map((entry) => ({ kind: "entry", entry }) as const)
        : []),
    ];
  });
  const table = useRef<HTMLTableElement>(null);
  const { first, last } = useRowsInView(table, rows.length);
  const describe = useDescribe(accountId);

  return (
    <table
      ref={table}
      className={styles.history}
      aria-label={label}
      aria-rowcount={rows.length}
    >
      <colgroup>
        <col />
        <col className={styles.numbersColumn} />
        <col className={styles.actionsColumn} />
      </colgroup>
      <tbody>
        {first > 0 && <tr aria-hidden style={{ height: first * ROW_HEIGHT }} />}
        {rows
          .slice(first, last)
          .map((row, index) =>
            row.kind === "statement" ? (
              <StatementRow
                key={row.statement.month}
                rowIndex={first + index + 1}
                statement={row.statement}
                open={row.open}
                onToggle={() =>
                  setFolding(
                    new Map(folding).set(row.statement.month, !row.open),
                  )
                }
              />
            ) : (
              <EntryRow
                key={row.entry.id}
                rowIndex={first + index + 1}
                {...describe(row.entry)}
                date={shortDate(row.entry.date)}
                actions={actionsFor(row.entry)}
                onOpen={() => onOpen(row.entry)}
              />
            ),
          )}
        {last < rows.length && (
          <tr
            aria-hidden
            style={{ height: (rows.length - last) * ROW_HEIGHT }}
          />
        )}
      </tbody>
    </table>
  );
}

function StatementRow({
  rowIndex,
  statement: { month, moneyIn, moneyOut, endedAt },
  open,
  onToggle,
}: {
  rowIndex: number;
  statement: Statement;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <tr aria-rowindex={rowIndex} style={{ height: ROW_HEIGHT }}>
      <th scope="rowgroup" colSpan={3} className={styles.statementCell}>
        <h3 className={styles.statementHeading}>
          <button
            type="button"
            className={styles.statement}
            aria-expanded={open}
            onClick={onToggle}
          >
            <span className={styles.month}>{monthName(month)}</span>{" "}
            <span className={styles.summary}>
              {formatMoney(moneyIn)} in, {formatMoney(moneyOut)} out, ended at{" "}
              {formatMoney(endedAt)}
            </span>
            <svg
              className={styles.chevron}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </h3>
      </th>
    </tr>
  );
}

export type Described = {
  title: string;
  detail: string;
  /** What the row shows moved, signed unless `unsigned`. */
  amount?: Money;
  unsigned?: boolean;
};

function EntryRow({
  rowIndex,
  title,
  detail,
  amount,
  unsigned = false,
  date,
  actions,
  onOpen,
}: Described & {
  rowIndex: number;
  date: string;
  actions: MenuAction[];
  onOpen: () => void;
}) {
  const cameIn = !unsigned && amount && amount.minorUnits > 0;
  return (
    <tr
      aria-rowindex={rowIndex}
      className={styles.entry}
      style={{ height: ROW_HEIGHT }}
    >
      <td>
        <span className={styles.title}>{title}</span>{" "}
        <span className={styles.detail}>{detail}</span>
      </td>
      <td className={styles.numbers}>
        {amount && (
          <span className={cameIn ? styles.cameIn : styles.amount}>
            {cameIn && "+"}
            {formatMoney(amount)}
          </span>
        )}{" "}
        <span className={styles.date}>{date}</span>
      </td>
      <td className={styles.actions}>
        {actions.length > 0 && (
          <span className={styles.more}>
            <Menu label={`More for ${title} on ${date}`} actions={actions} />
          </span>
        )}
        <button
          type="button"
          className={styles.open}
          aria-label={`Open ${title} on ${date}`}
          onClick={onOpen}
        />
      </td>
    </tr>
  );
}

/** How to read each entry, seen from one Account or, each naming its own, across all. */
export function useDescribe(accountId?: string) {
  const accountNames = new Map(useAccounts().map(({ id, name }) => [id, name]));
  const categoryNames = new Map(
    useCategoryGroups().flatMap(({ categories }) =>
      categories.map(({ id, name }) => [id, name]),
    ),
  );
  const name = (id: string) => accountNames.get(id) ?? "";

  return (entry: TransactionListEntry): Described => {
    /** Across every Account, the detail adds which Account it is in. */
    const inAccount = (detail: string) =>
      accountId || entry.kind === "transfer"
        ? detail
        : `${detail}, ${name(entry.accountId)}`;
    switch (entry.kind) {
      case "transaction":
        return {
          title: entry.payee || "Transaction",
          detail: inAccount(
            entry.categoryId
              ? (categoryNames.get(entry.categoryId) ?? "")
              : "Ready to Assign",
          ),
          amount: entry.amount,
        };
      case "transfer": {
        const { fromAccountId: from, toAccountId: to, amount } = entry;
        if (from === accountId) {
          return {
            title: `To ${name(to)}`,
            detail: "Transfer",
            amount: { ...amount, minorUnits: -amount.minorUnits },
          };
        }
        if (to === accountId) {
          return { title: `From ${name(from)}`, detail: "Transfer", amount };
        }
        return {
          title: `${name(from)} to ${name(to)}`,
          detail: "Transfer",
          amount,
          unsigned: true,
        };
      }
      case "adjustment":
        return {
          title: "Adjustment",
          detail: inAccount(
            `You updated the balance to ${formatMoney(entry.balance)}`,
          ),
          amount: entry.amount,
        };
      case "balance-check":
        return {
          title: "Balance checked",
          detail: inAccount(
            `Matched your bank at ${formatMoney(entry.balance)}`,
          ),
        };
      case "opening-balance":
        return {
          title: "Opening Balance",
          detail: inAccount("Ready to Assign"),
          amount: entry.amount,
        };
    }
  };
}

/** A calendar date as people read it in a list, such as "Oct 18". */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * Which rows of a list, in the page's own scrolling, are in view or close to
 * it. It measures after every render too, since what sits above the list can
 * change its place on the page without any scrolling.
 */
function useRowsInView(
  list: RefObject<HTMLElement | null>,
  rowCount: number,
): { first: number; last: number } {
  const [view, setView] = useState({ first: 0, last: OVERSCAN * 2 });
  useLayoutEffect(() => {
    function measure() {
      if (!list.current) return;
      const { top } = list.current.getBoundingClientRect();
      const first = Math.max(0, Math.floor(-top / ROW_HEIGHT) - OVERSCAN);
      const last =
        Math.max(0, Math.ceil((window.innerHeight - top) / ROW_HEIGHT)) +
        OVERSCAN;
      setView((now) =>
        now.first === first && now.last === last ? now : { first, last },
      );
    }
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  });
  const last = Math.min(view.last, rowCount);
  return { first: Math.min(view.first, last), last };
}
