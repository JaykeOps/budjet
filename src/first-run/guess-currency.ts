import type { Currency } from "../kernel/money";

const EURO_REGIONS =
  "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" ");

const CURRENCY_BY_REGION: Readonly<Record<string, Currency>> = {
  ...Object.fromEntries(EURO_REGIONS.map((region) => [region, "EUR"])),
  AE: "AED",
  AR: "ARS",
  AU: "AUD",
  BG: "BGN",
  BR: "BRL",
  CA: "CAD",
  CH: "CHF",
  CL: "CLP",
  CN: "CNY",
  CO: "COP",
  CZ: "CZK",
  DK: "DKK",
  EG: "EGP",
  GB: "GBP",
  HK: "HKD",
  HU: "HUF",
  ID: "IDR",
  IL: "ILS",
  IN: "INR",
  IS: "ISK",
  JP: "JPY",
  KE: "KES",
  KR: "KRW",
  MX: "MXN",
  MY: "MYR",
  NG: "NGN",
  NO: "NOK",
  NZ: "NZD",
  PH: "PHP",
  PK: "PKR",
  PL: "PLN",
  RO: "RON",
  SA: "SAR",
  SE: "SEK",
  SG: "SGD",
  TH: "THB",
  TR: "TRY",
  TW: "TWD",
  UA: "UAH",
  US: "USD",
  VN: "VND",
  ZA: "ZAR",
};

/**
 * A first guess at the Budget's currency. The browser can't say which currency
 * a region uses, so this is a table of the likely ones, and the user can
 * always choose another.
 */
export function guessCurrency(locale: string): Currency {
  const { region } = new Intl.Locale(locale).maximize();
  return (region && CURRENCY_BY_REGION[region]) || "USD";
}
