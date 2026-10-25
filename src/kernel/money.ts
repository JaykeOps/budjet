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
  return format.format(amount.minorUnits / 10 ** minorDigits(amount.currency));
}

const TYPED_AMOUNT = /^(-?)(\d+)(?:[.,](\d+))?$/;

/**
 * Reads an amount the user typed, such as "1234.56" or "-50,5", without ever
 * going through a floating-point number. Undefined when the text isn't an
 * amount, or has more decimals than the currency has minor units.
 */
export function parseMoney(
  text: string,
  currency: Currency,
): Money | undefined {
  const match = TYPED_AMOUNT.exec(text.trim());
  if (!match) return undefined;
  const [, sign, whole, fraction = ""] = match;
  const digits = minorDigits(currency);
  if (fraction.length > digits) return undefined;
  const minorUnits = Number(whole + fraction.padEnd(digits, "0"));
  if (!Number.isSafeInteger(minorUnits)) return undefined;
  return money(sign && minorUnits ? -minorUnits : minorUnits, currency);
}

/** How many digits the currency's minor units take: 2 for USD, 0 for JPY. */
function minorDigits(currency: Currency): number {
  return (
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 0
  );
}
