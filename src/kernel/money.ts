/** An ISO 4217 currency code, e.g. "USD". */
export type Currency = string;

/** Every currency a Budget can use: the ones this browser can format. */
export function currencies(): readonly Currency[] {
  return Intl.supportedValuesOf("currency");
}

export function isCurrency(code: string): code is Currency {
  return currencies().includes(code);
}

/** An amount in the Budget's currency, as a whole number of minor units (cents for USD). */
export type Money = {
  readonly minorUnits: number;
  readonly currency: Currency;
};

export function money(minorUnits: number, currency: Currency): Money {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(
      `Money must be a whole number of minor units, got ${minorUnits}`,
    );
  }
  return { minorUnits, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(`Can't add ${a.currency} and ${b.currency}`);
  }
  return money(a.minorUnits + b.minorUnits, a.currency);
}

/** For display only: the one place minor units become a decimal number. */
export function formatMoney(amount: Money, locale?: string): string {
  const format = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: amount.currency,
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 0;
  return format.format(amount.minorUnits / 10 ** digits);
}
