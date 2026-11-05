import { type FormEvent, type ReactNode, useId, useState } from "react";
import {
  type Currency,
  formatMoney,
  type Money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
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

export type RowsProps = {
  groups: CategoryGroup[];
  month: Month;
  currency: Currency;
  onAssign: (categoryId: string, amount: Money) => void;
  onError: (message: string | undefined) => void;
  onOpenCategory: (categoryId: string) => void;
  onAssignGroup: (group: CategoryGroup) => void;
  /** The Category a newcomer starts at, highlighted until anything is assigned. */
  coachedCategoryId?: string;
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

function ListRow({
  category,
  month,
  currency,
  onOpenCategory,
  coachedCategoryId,
}: RowProps) {
  const nameId = useId();
  const row = useCategoryRow(category.id, month, currency);
  return (
    <li
      className={styles.row}
      data-state={row.state}
      data-coached={category.id === coachedCategoryId || undefined}
      aria-labelledby={nameId}
    >
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
export function CategoryTables(props: RowsProps) {
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
}: RowsProps & {
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
  onAssign,
  onError,
  onOpenCategory,
  coachedCategoryId,
}: RowProps) {
  const row = useCategoryRow(category.id, month, currency);
  return (
    <tr
      className={styles.tableRow}
      data-state={row.state}
      data-coached={category.id === coachedCategoryId || undefined}
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
        <AssignmentField
          category={category}
          assigned={row.assigned}
          currency={currency}
          onAssign={onAssign}
          onError={onError}
        />
      </td>
      <td>
        <span className={styles.tableSpending}>
          <Meter name={category.name} row={row} />
          <span>{formatMoney(row.spending)}</span>
        </span>
      </td>
      <td>
        <Pill row={row} />
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

/** Set by typing an amount and pressing Enter or leaving the field. */
function AssignmentField({
  category,
  assigned,
  currency,
  onAssign,
  onError,
}: Pick<RowProps, "category" | "currency" | "onAssign" | "onError"> & {
  assigned: Money;
}) {
  const [draft, setDraft] = useState<string>();

  function save() {
    if (draft === undefined) return;
    const amount = parseMoney(draft, currency);
    if (!amount) {
      onError(`"${draft}" isn't an amount in ${currency}`);
      return;
    }
    setDraft(undefined);
    onError(undefined);
    if (amount.minorUnits !== assigned.minorUnits) {
      onAssign(category.id, amount);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save();
  }

  return (
    <form className={styles.assignmentForm} onSubmit={submit}>
      <input
        className={styles.assignment}
        aria-label={`Assignment for ${category.name}`}
        inputMode="decimal"
        value={draft ?? typedMoney(assigned)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
      />
    </form>
  );
}
