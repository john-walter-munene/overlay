/**
 * Currency data + pure FX conversion shared across API and web (OB-06x).
 *
 * Prices are stored in USD minor units (cents). To charge in a subscriber's
 * local currency we map their country → ISO 4217 currency, then convert with a
 * rate supplied by the API's FX layer. Conversion math (minor-unit scaling +
 * rounding) lives here so it's unit-tested and shared.
 */

/** Base currency all stored prices are denominated in. */
export const BASE_CURRENCY = 'USD';

/** ISO 3166 alpha-2 country → ISO 4217 currency code. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  AF: 'AFN', AL: 'ALL', DZ: 'DZD', AD: 'EUR', AO: 'AOA', AG: 'XCD', AR: 'ARS',
  AM: 'AMD', AU: 'AUD', AT: 'EUR', AZ: 'AZN', BS: 'BSD', BH: 'BHD', BD: 'BDT',
  BB: 'BBD', BY: 'BYN', BE: 'EUR', BZ: 'BZD', BJ: 'XOF', BT: 'BTN', BO: 'BOB',
  BA: 'BAM', BW: 'BWP', BR: 'BRL', BN: 'BND', BG: 'BGN', BF: 'XOF', BI: 'BIF',
  KH: 'KHR', CM: 'XAF', CA: 'CAD', CV: 'CVE', CF: 'XAF', TD: 'XAF', CL: 'CLP',
  CN: 'CNY', CO: 'COP', KM: 'KMF', CG: 'XAF', CD: 'CDF', CR: 'CRC', CI: 'XOF',
  HR: 'EUR', CU: 'CUP', CY: 'EUR', CZ: 'CZK', DK: 'DKK', DJ: 'DJF', DM: 'XCD',
  DO: 'DOP', EC: 'USD', EG: 'EGP', SV: 'USD', GQ: 'XAF', ER: 'ERN', EE: 'EUR',
  SZ: 'SZL', ET: 'ETB', FJ: 'FJD', FI: 'EUR', FR: 'EUR', GA: 'XAF', GM: 'GMD',
  GE: 'GEL', DE: 'EUR', GH: 'GHS', GR: 'EUR', GD: 'XCD', GT: 'GTQ', GN: 'GNF',
  GW: 'XOF', GY: 'GYD', HT: 'HTG', HN: 'HNL', HK: 'HKD', HU: 'HUF', IS: 'ISK',
  IN: 'INR', ID: 'IDR', IR: 'IRR', IQ: 'IQD', IE: 'EUR', IL: 'ILS', IT: 'EUR',
  JM: 'JMD', JP: 'JPY', JO: 'JOD', KZ: 'KZT', KE: 'KES', KI: 'AUD', KW: 'KWD',
  KG: 'KGS', LA: 'LAK', LV: 'EUR', LB: 'LBP', LS: 'LSL', LR: 'LRD', LY: 'LYD',
  LI: 'CHF', LT: 'EUR', LU: 'EUR', MO: 'MOP', MG: 'MGA', MW: 'MWK', MY: 'MYR',
  MV: 'MVR', ML: 'XOF', MT: 'EUR', MH: 'USD', MR: 'MRU', MU: 'MUR', MX: 'MXN',
  FM: 'USD', MD: 'MDL', MC: 'EUR', MN: 'MNT', ME: 'EUR', MA: 'MAD', MZ: 'MZN',
  MM: 'MMK', NA: 'NAD', NR: 'AUD', NP: 'NPR', NL: 'EUR', NZ: 'NZD', NI: 'NIO',
  NE: 'XOF', NG: 'NGN', KP: 'KPW', MK: 'MKD', NO: 'NOK', OM: 'OMR', PK: 'PKR',
  PW: 'USD', PS: 'ILS', PA: 'PAB', PG: 'PGK', PY: 'PYG', PE: 'PEN', PH: 'PHP',
  PL: 'PLN', PT: 'EUR', QA: 'QAR', RO: 'RON', RU: 'RUB', RW: 'RWF', KN: 'XCD',
  LC: 'XCD', VC: 'XCD', WS: 'WST', SM: 'EUR', ST: 'STN', SA: 'SAR', SN: 'XOF',
  RS: 'RSD', SC: 'SCR', SL: 'SLE', SG: 'SGD', SK: 'EUR', SI: 'EUR', SB: 'SBD',
  SO: 'SOS', ZA: 'ZAR', KR: 'KRW', SS: 'SSP', ES: 'EUR', LK: 'LKR', SD: 'SDG',
  SR: 'SRD', SE: 'SEK', CH: 'CHF', SY: 'SYP', TW: 'TWD', TJ: 'TJS', TZ: 'TZS',
  TH: 'THB', TL: 'USD', TG: 'XOF', TO: 'TOP', TT: 'TTD', TN: 'TND', TR: 'TRY',
  TM: 'TMT', TV: 'AUD', UG: 'UGX', UA: 'UAH', AE: 'AED', GB: 'GBP', US: 'USD',
  UY: 'UYU', UZ: 'UZS', VU: 'VUV', VA: 'EUR', VE: 'VES', VN: 'VND', YE: 'YER',
  ZM: 'ZMW', ZW: 'ZWL',
};

/**
 * Currencies whose minor unit isn't 2 decimals. Zero-decimal currencies charge
 * whole units; three-decimal ones (Gulf dinars) charge thousandths. Anything
 * not listed defaults to 2.
 */
export const CURRENCY_EXPONENT: Record<string, number> = {
  // Zero-decimal
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, KPW: 0,
  PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three-decimal
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

/** Number of minor-unit decimals for a currency (default 2). */
export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** Sorted, de-duplicated list of every currency we know a country uses. */
export const CURRENCY_CODES: readonly string[] = [
  ...new Set(Object.values(COUNTRY_CURRENCY)),
].sort();

/** Local currency for a country code, or null if unknown. */
export function currencyForCountry(
  countryCode: string | null | undefined,
): string | null {
  if (!countryCode) return null;
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? null;
}

/**
 * Convert an amount in USD cents to a target currency's minor units using
 * `rate` (target units per 1 USD). Handles differing minor-unit exponents and
 * rounds to the nearest minor unit.
 *
 * @example convertUsdCents(1999, 129, 'KES') // $19.99 → ~257871 (KES 2578.71)
 */
export function convertUsdCents(
  usdCents: number,
  rate: number,
  targetCurrency: string,
): number {
  const usd = usdCents / 100;
  const targetMajor = usd * rate;
  const exponent = currencyExponent(targetCurrency);
  return Math.round(targetMajor * 10 ** exponent);
}

/** Format minor units as a human string, e.g. (257871,'KES') → "KES 2,578.71". */
export function formatMinorUnits(minor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  const major = minor / 10 ** exponent;
  return `${currency} ${major.toLocaleString(undefined, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  })}`;
}
