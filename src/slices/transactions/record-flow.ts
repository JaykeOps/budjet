import type { ChangeRecord } from "../../kernel/change-log";
import {
  type Currency,
  type Money,
  money,
  parseMoney,
  typedMoney,
} from "../../kernel/money";
import { type Month, monthOf } from "../../kernel/month";
import { available, readyToAssign } from "../budget-totals";
import { categoryGroups } from "../categories";
import type { KnownPayee, Transaction } from "./queries";

export type Direction = "out" | "in";

/** A Transaction part way through being recorded. */
export type Draft = {
  direction: Direction;
  /** The amount as typed, without a sign. */
  typed: string;
  /** None means none chosen yet for money out, and Ready to Assign for money in. */
  categoryId?: string;
  payee: string;
  date: string;
  accountId: string;
  /** The phone doesn't show a memo, but editing keeps one. */
  memo?: string;
};

/** A Draft saying what this Transaction says, to edit it. */
export function draftOf({
  amount,
  categoryId,
  payee,
  memo,
  date,
  accountId,
}: Transaction): Draft {
  return {
    direction: amount.minorUnits > 0 ? "in" : "out",
    typed: typedMoney(money(Math.abs(amount.minorUnits), amount.currency)),
    ...(categoryId && { categoryId }),
    payee: payee ?? "",
    ...(memo && { memo }),
    date,
    accountId,
  };
}

/** Changing direction forgets the Category: money in starts at Ready to Assign, and money out must choose. */
export function withDirection(draft: Draft, direction: Direction): Draft {
  if (draft.direction === direction) return draft;
  const { categoryId: _, ...rest } = draft;
  return { ...rest, direction };
}

/** The Draft's amount, signed by its direction. Undefined until it's above zero. */
export function draftAmount(
  draft: Draft,
  currency: Currency,
): Money | undefined {
  const typed = parseMoney(draft.typed, currency);
  if (!typed || typed.minorUnits <= 0) return undefined;
  return draft.direction === "out" ? money(-typed.minorUnits, currency) : typed;
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The Draft with this Payee. A known one fills in its Account, and its last
 * Category if no Category is chosen. Ready to Assign counts as chosen.
 */
export function withPayee(
  draft: Draft,
  payee: string,
  known: readonly KnownPayee[],
): Draft {
  const match = known.find(({ name }) => sameName(name, payee));
  const fillsCategory =
    draft.direction === "out" && !draft.categoryId && match?.categoryId;
  return {
    ...draft,
    payee,
    ...(fillsCategory && { categoryId: match.categoryId }),
    ...(match?.accountId && { accountId: match.accountId }),
  };
}

/** Known Payees to offer for what's typed: those it starts, until it's a whole name. */
export function matchingPayees(
  typed: string,
  known: readonly KnownPayee[],
): KnownPayee[] {
  const start = typed.trim().toLowerCase();
  if (!start || known.some(({ name }) => sameName(name, typed))) return [];
  return known
    .filter(({ name }) => name.toLowerCase().startsWith(start))
    .slice(0, 3);
}

export type CategoryChoice = { id: string; name: string; available: Money };

export type CategoryChoices = {
  readyToAssign: Money;
  groups: { id: string; name: string; categories: CategoryChoice[] }[];
};

/**
 * What money can be recorded against in a Month: every visible Category by
 * Group, and Ready to Assign. When `editing` a Transaction, its own money is left
 * out, since saving replaces it, and its Category stays offered if now hidden.
 */
export function categoryChoices(
  records: readonly ChangeRecord[],
  of: Month,
  currency: Currency,
  editing?: Transaction,
): CategoryChoices {
  const zero = money(0, currency);
  const without = (from: Money, counted: boolean) =>
    editing && counted
      ? money(from.minorUnits - editing.amount.minorUnits, currency)
      : from;
  return {
    readyToAssign: without(
      readyToAssign(records) ?? zero,
      editing?.categoryId === undefined,
    ),
    groups: categoryGroups(records)
      .map(({ id, name, categories }) => ({
        id,
        name,
        categories: categories
          .filter(({ id, hidden }) => !hidden || id === editing?.categoryId)
          .map((category) => ({
            id: category.id,
            name: category.name,
            // Available carries forward, so it holds this money from its Month on.
            available: without(
              available(records, category.id, of) ?? zero,
              editing?.categoryId === category.id &&
                monthOf(editing.date) <= of,
            ),
          })),
      }))
      .filter(({ categories }) => categories.length > 0),
  };
}

/** Whether the Draft now says something other than what it started as. */
export function draftChanged(
  draft: Draft,
  started: Draft,
  currency: Currency,
): boolean {
  return (
    draftAmount(draft, currency)?.minorUnits !==
      draftAmount(started, currency)?.minorUnits ||
    draft.categoryId !== started.categoryId ||
    draft.payee.trim() !== started.payee.trim() ||
    draft.date !== started.date ||
    draft.accountId !== started.accountId
  );
}

/** The Draft to start on once this one is recorded. Date and Account stay: several in a row usually share them. */
export function nextDraft({ date, accountId }: Draft): Draft {
  return { direction: "out", typed: "", payee: "", date, accountId };
}

/** The first field the Draft can't be recorded without, in the order the row has them. */
export function missingField(
  draft: Draft,
  currency: Currency,
): "category" | "amount" | undefined {
  if (draft.direction === "out" && !draft.categoryId) return "category";
  return draftAmount(draft, currency) ? undefined : "amount";
}

/** What the Draft's Category, or Ready to Assign for money in with none, would hold after it. Undefined until money out has a Category. */
export function afterThis(
  draft: Draft,
  currency: Currency,
  { readyToAssign, groups }: CategoryChoices,
): { name: string; after: Money } | undefined {
  const category = groups
    .flatMap(({ categories }) => categories)
    .find(({ id }) => id === draft.categoryId);
  if (!category && draft.direction === "out") return undefined;
  const now = category?.available ?? readyToAssign;
  const change = draftAmount(draft, currency)?.minorUnits ?? 0;
  return {
    name: category?.name ?? "Ready to Assign",
    after: money(now.minorUnits + change, currency),
  };
}

const pad = (part: number) => String(part).padStart(2, "0");

function calendarDate(day: Date): string {
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** This device's local date, "YYYY-MM-DD". */
export function today(): string {
  return calendarDate(new Date());
}

/** The calendar date before this one. */
export function dayBefore(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return calendarDate(new Date(year, month - 1, day - 1));
}
