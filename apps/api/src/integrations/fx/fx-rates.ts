/**
 * Static USD exchange rates for local development / tests and as a fallback
 * when no live FX source (FX_API_URL) is configured. Values are target units
 * per 1 USD and are approximate — wire a live source in production.
 */
export const STATIC_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
  NZD: 1.64,
  CHF: 0.88,
  JPY: 150,
  CNY: 7.2,
  INR: 83,
  ZAR: 18.5,
  NGN: 1600,
  KES: 129,
  GHS: 15,
  UGX: 3800,
  TZS: 2600,
  RWF: 1300,
  XOF: 600,
  XAF: 600,
  EGP: 48,
  MAD: 10,
  BRL: 5.1,
  MXN: 18,
  AED: 3.67,
  SAR: 3.75,
  TRY: 33,
  PKR: 278,
  BDT: 118,
  PHP: 57,
  IDR: 16000,
  THB: 35,
  MYR: 4.6,
  SGD: 1.34,
  HKD: 7.8,
  KRW: 1350,
  UAH: 41,
  PLN: 3.95,
  SEK: 10.5,
  NOK: 10.7,
  DKK: 6.9,
};

/** Static USD→currency rate, or null when the currency isn't in the table. */
export function staticUsdRate(currency: string): number | null {
  return STATIC_USD_RATES[currency.toUpperCase()] ?? null;
}
