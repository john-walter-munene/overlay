import { Injectable, Logger } from '@nestjs/common';
import { convertUsdCents } from '@overlay/shared';
import { staticUsdRate, STATIC_USD_RATES } from './fx-rates';

/** A price quote in a (possibly converted) charge currency. */
export interface CurrencyQuote {
  /** ISO 4217 currency the charge is denominated in. */
  currency: string;
  /** Charge amount in that currency's minor units (e.g. cents). */
  amountMinor: number;
  /** Target units per 1 USD used for the conversion. */
  rate: number;
  /** True when the amount was converted away from USD. */
  converted: boolean;
}

/**
 * Currency conversion for checkout (OB-06x). Quotes a USD-cents price into a
 * subscriber's local currency using live rates (FX_API_URL, base USD) with a
 * static fallback table. Rates are cached in-process for FX_CACHE_TTL_MS.
 *
 * A live source is expected to return `{ rates: { EUR: 0.92, KES: 129, … } }`
 * (target units per 1 USD), the shape used by openexchangerates / exchangerate
 * -style APIs.
 */
@Injectable()
export class CurrencyService {
  private readonly log = new Logger(CurrencyService.name);
  private cache: { rates: Record<string, number>; at: number } | null = null;

  private get ttlMs(): number {
    return Number(process.env.FX_CACHE_TTL_MS ?? 3_600_000);
  }

  /**
   * Quote `usdCents` in `targetCurrency`. Falls back to USD (no conversion)
   * when the target is USD/unknown or no rate is available, so checkout never
   * fails on a missing rate.
   */
  async quote(
    usdCents: number,
    targetCurrency?: string | null,
  ): Promise<CurrencyQuote> {
    const target = targetCurrency?.toUpperCase();
    if (!target || target === 'USD') {
      return { currency: 'USD', amountMinor: usdCents, rate: 1, converted: false };
    }
    const rate = await this.usdRate(target);
    if (!rate || rate <= 0) {
      return { currency: 'USD', amountMinor: usdCents, rate: 1, converted: false };
    }
    return {
      currency: target,
      amountMinor: convertUsdCents(usdCents, rate, target),
      rate,
      converted: true,
    };
  }

  /** Resolve the USD→currency rate from cache, a live source, or the static table. */
  private async usdRate(currency: string): Promise<number | null> {
    const rates = await this.loadRates();
    return rates[currency] ?? staticUsdRate(currency);
  }

  private async loadRates(): Promise<Record<string, number>> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.ttlMs) {
      return this.cache.rates;
    }
    const url = process.env.FX_API_URL;
    if (!url) {
      this.cache = { rates: STATIC_USD_RATES, at: now };
      return STATIC_USD_RATES;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FX source ${res.status}`);
      const json = (await res.json()) as { rates?: Record<string, number> };
      const rates = json.rates ?? {};
      this.cache = { rates, at: now };
      return rates;
    } catch (err) {
      this.log.warn(
        `FX source failed, using static rates: ${(err as Error).message}`,
      );
      this.cache = { rates: STATIC_USD_RATES, at: now };
      return STATIC_USD_RATES;
    }
  }
}
