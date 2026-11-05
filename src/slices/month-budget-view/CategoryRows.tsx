import { type ReactNode, useId } from "react";
import { type Currency, formatMoney, type Money } from "../../kernel/money";
import type { Month } from "../../kernel/month";
import type { Category, CategoryGroup } from "../categories";
import {
  type CategoryRow,
  overspentHint,
  useCategoryRow,
} from "./category-row";
import { useGroupSubtotals } from "./group-subtotals";
import { availableHint, Hint } from "./Hint";
import styles from "./MonthBudget.module.css";
import type { AssignedColumn } from "./use-assigned-column";

export type RowsProps = {
  groups: CategoryGroup[];
  month: Month;
  currency: Currency;
  onOpenCategory: (categoryId: string) => void;
  onAssignGroup: (group: CategoryGroup) => void;
};

/** A phone's rows: one card per Category Group. */
export function CategoryLists(props: RowsProps) {
  const { groups, month, currency } = props;
  const subtotals = useGroupSubtotals(month, currency);
  return groups.map((group) => (
    <GroupList
      key={group.id}
      group={group}
      available={subtotals[group.id]?.available}
      {...props}
    />
  ));
}

function GroupList({
  group,
  available,
  ...props
}: RowsProps & { group: CategoryGroup; available: Money | undefined }) {
  const headingId = useId();
  return (
    <section className={styles.group} aria-labelledby={headingId}>
      <div className={styles.groupHead}>
        <h3 id={headingId} className={styles.groupName}>
          {group.name}
        </h3>
        <AssignGroup group={group} onAssignGroup={props.onAssignGroup} />
        <span className={styles.groupAvailable}>
          Available <Hint term="Available">{availableHint}</Hint>{" "}
          <span>{available && formatMoney(available)}</span>
        </span>
      </div>
      <ul className={styles.list} aria-labelledby={headingId}>
        {group.categories.map((category) => (
          <ListRow
            // A new Month starts every row afresh, dropping unsaved drafts.
            key={`${props.month}/${category.id}`}
            category={category}
            {...props}
          />
        ))}
      </ul>
    </section>
  );
}

type RowProps = RowsProps & { category: Category };
type TableProps = RowsProps & { column: AssignedColumn };

function ListRow({ category, month, currency, onOpenCategory }: RowProps) {
  const nameId = useId();
  const row = useCategoryRow(category.id, month, currency);
  return (
    <li className={styles.row} data-state={row.state} aria-labelledby={nameId}>
      <Tile name={category.name} />
      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          {/* Stretched over the whole row, so tapping anywhere on it opens the sheet. */}
          <button
            id={nameId}
            type="button"
            className={styles.rowOpen}
            onClick={() => onOpenCategory(category.id)}
          >
            {category.name}
          </button>
          <Pill row={row} />
        </div>
        <Meter name={category.name} row={row} />
        {row.state === "overspent" ? (
          <OverspentNote name={category.name} row={row}>
            <button
              type="button"
              className={styles.coverIt}
              onClick={() => onOpenCategory(category.id)}
            >
              Cover it
            </button>
          </OverspentNote>
        ) : (
          <p className={styles.small}>{row.note}</p>
        )}
        {row.takenBack.minorUnits !== 0 && (
          <p className={styles.small}>{row.carried}</p>
        )}
      </div>
    </li>
  );
}

/** Desktop's rows: one table card per Category Group, sharing the first one's column headings. */
export function CategoryTables(props: TableProps) {
  const { groups, month, currency } = props;
  const subtotals = useGroupSubtotals(month, currency);
  return groups.map((group, index) => (
    <GroupTable
      key={group.id}
      group={group}
      headed={index === 0}
      assigned={subtotals[group.id]?.assigned}
      spent={subtotals[group.id]?.spent}
      available={subtotals[group.id]?.available}
      {...props}
    />
  ));
}

function GroupTable({
  group,
  headed,
  assigned,
  spent,
  available,
  ...props
}: TableProps & {
  group: CategoryGroup;
  headed: boolean;
  assigned: Money | undefined;
  spent: Money | undefined;
  available: Money | undefined;
}) {
  const headingId = useId();
  return (
    <div className={styles.tableCard}>
      <table className={styles.table} aria-labelledby={headingId}>
        <colgroup>
          <col />
          <col className={styles.assignedColumn} />
          <col className={styles.spendingColumn} />
          <col className={styles.availableColumn} />
        </colgroup>
        <thead
          className={headed ? styles.tableHead : styles.tableHeadForReaders}
        >
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Assigned</th>
            <th scope="col">Spending</th>
            <th scope="col">
              Available{" "}
              {headed && <Hint term="Available">{availableHint}</Hint>}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className={styles.groupRow}>
            <th scope="rowgroup">
              <h3 id={headingId} className={styles.groupName}>
                {group.name}
              </h3>
              <AssignGroup group={group} onAssignGroup={props.onAssignGroup} />
            </th>
            <td>{assigned && formatMoney(assigned)}</td>
            <td>{spent && formatMoney(spent)}</td>
            <td>{available && formatMoney(available)}</td>
          </tr>
          {group.categories.map((category) => (
            <TableRow
              // A new Month starts every row afresh, dropping unsaved drafts.
              key={`${props.month}/${category.id}`}
              category={category}
              {...props}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  category,
  month,
  currency,
  column,
  onOpenCategory,
}: TableProps & { category: Category }) {
  const row = useCategoryRow(category.id, month, currency);
  const focused = column.focusedId === category.id;
  return (
    <tr
      className={styles.tableRow}
      data-state={row.state}
      data-focused={focused}
    >
      <th scope="row">
        <span className={styles.tableName}>
          <Tile name={category.name} />
          <span>
            <button
              type="button"
              className={styles.tableOpen}
              onClick={() => onOpenCategory(category.id)}
            >
              {category.name}
            </button>
            {row.carried && (
              <span className={styles.carried}>{row.carried}</span>
            )}
            {row.state === "overspent" && (
              <OverspentNote name={category.name} row={row} />
            )}
          </span>
        </span>
      </th>
      <td>
        <input
          className={styles.assignment}
          aria-label={`Assignment for ${category.name}`}
          inputMode="decimal"
          autoComplete="off"
          {...column.field(category.id, row.assigned)}
        />
        {/* Only the Tab after the focused field, so the panel is never far away. */}
        {focused && column.panelShown && (
          <button
            type="button"
            className={styles.goToPanel}
            onClick={column.goToPanel}
          >
            Go to the panel
          </button>
        )}
      </td>
      <td>
        <span className={styles.tableSpending}>
          <Meter name={category.name} row={row} />
          <span>{formatMoney(row.spending)}</span>
        </span>
      </td>
      <td>
        <span className={styles.tableAvailable}>
          <Pill row={row} />
          {row.state === "overspent" && (
            <button
              type="button"
              className={styles.coverIt}
              aria-label={`Cover ${category.name}`}
              onClick={() => column.cover(category.id)}
            >
              Cover
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

function AssignGroup({
  group,
  onAssignGroup,
}: Pick<RowsProps, "onAssignGroup"> & { group: CategoryGroup }) {
  return (
    <button
      type="button"
      className={styles.assignGroup}
      onClick={() => onAssignGroup(group)}
    >
      Assign {group.name}
    </button>
  );
}

function Tile({ name }: { name: string }) {
  return (
    <span className={styles.tile} aria-hidden>
      {[...name][0]?.toUpperCase()}
    </span>
  );
}

function Pill({ row }: { row: CategoryRow }) {
  return (
    <span className={styles.pill} data-state={row.state}>
      {formatMoney(row.available)}
    </span>
  );
}

function Meter({ name, row }: { name: string; row: CategoryRow }) {
  const percent = Math.round(row.meter * 100);
  return (
    // A styled bar: the native <meter> can't take these shapes in every browser.
    // biome-ignore lint/a11y/useSemanticElements: see above
    <span
      className={styles.meter}
      data-over={row.state === "overspent"}
      role="meter"
      aria-label={`Spending in ${name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <i style={{ width: `${percent}%` }} />
    </span>
  );
}

function OverspentNote({
  name,
  row,
  children,
}: {
  name: string;
  row: CategoryRow;
  children?: ReactNode;
}) {
  return (
    <span className={styles.overspentNote}>
      {row.note} <Hint term="Overspent">{overspentHint(name, row)}</Hint>
      {children}
    </span>
  );
}
