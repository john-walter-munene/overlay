'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  computeReturns,
  convertOdds,
  formatMoney,
  parseOddsInput,
  type OddsFormat,
} from '@overlay/shared/odds';
import { CURRENCY_CODES } from '@overlay/shared/currencies';

const FORMATS: { value: OddsFormat; placeholder: string }[] = [
  { value: 'decimal', placeholder: '2.50' },
  { value: 'fractional', placeholder: '3/2' },
  { value: 'american', placeholder: '+150' },
  { value: 'probability', placeholder: '40' },
];

const card = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 12,
  padding: '1.5rem',
} as const;

const label = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  marginBottom: '0.35rem',
  color: 'var(--muted)',
} as const;

const control = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--fg)',
  padding: '0.6rem 0.75rem',
  fontSize: '1rem',
  width: '100%',
  boxSizing: 'border-box' as const,
};

/** Read a query-param default, falling back to `fallback` when absent. */
function param(
  params: URLSearchParams,
  key: string,
  fallback: string,
): string {
  return params.get(key) ?? fallback;
}

function OddsConverter({ params }: { params: URLSearchParams }) {
  const t = useTranslations('oddsCalculator');
  const formatLabel = (f: OddsFormat) => t(`format_${f}`);
  const initialFormat = FORMATS.some((f) => f.value === params.get('cf'))
    ? (params.get('cf') as OddsFormat)
    : 'decimal';
  const [format, setFormat] = useState<OddsFormat>(initialFormat);
  const [value, setValue] = useState(param(params, 'cv', '2.50'));

  const decimal = useMemo(
    () => parseOddsInput(value, format),
    [value, format],
  );
  const conversion = useMemo(
    () => (decimal === null ? null : convertOdds(decimal)),
    [decimal],
  );

  const active = FORMATS.find((f) => f.value === format) ?? FORMATS[0];

  return (
    <section style={card} aria-labelledby="converter-heading">
      <h2 id="converter-heading" style={{ marginTop: 0 }}>
        {t('converterHeading')}
      </h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('converterIntro')}
      </p>

      <div style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <label htmlFor="converter-format" style={label}>
            {t('inputFormat')}
          </label>
          <select
            id="converter-format"
            style={control}
            value={format}
            onChange={(e) => setFormat(e.target.value as OddsFormat)}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {formatLabel(f.value)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="converter-value" style={label}>
            {t('oddsLabel', { format: formatLabel(format) })}
          </label>
          <input
            id="converter-value"
            style={control}
            inputMode={format === 'fractional' ? 'text' : 'decimal'}
            placeholder={active.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby="converter-status"
          />
        </div>
      </div>

      <div id="converter-status" aria-live="polite" style={{ marginTop: '1rem' }}>
        {conversion ? (
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              rowGap: '0.5rem',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--muted)' }}>{t('decimal')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{conversion.decimal}</dd>
            <dt style={{ color: 'var(--muted)' }}>{t('fractional')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {conversion.fractional}
            </dd>
            <dt style={{ color: 'var(--muted)' }}>{t('american')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {conversion.american > 0
                ? `+${conversion.american}`
                : conversion.american}
            </dd>
            <dt style={{ color: 'var(--muted)' }}>{t('impliedProbability')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {(conversion.impliedProbability * 100).toFixed(2)}%
            </dd>
          </dl>
        ) : (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            {t('enterValid', { format: formatLabel(format).toLowerCase() })}
          </p>
        )}
      </div>
    </section>
  );
}

function ReturnsCalculator({ params }: { params: URLSearchParams }) {
  const t = useTranslations('oddsCalculator');
  const [stake, setStake] = useState(param(params, 'stake', '10'));
  const [odds, setOdds] = useState(param(params, 'odds', '2.50'));
  const initialCurrency = CURRENCY_CODES.includes(
    (params.get('cur') ?? '').toUpperCase(),
  )
    ? (params.get('cur') as string).toUpperCase()
    : 'USD';
  const [currency, setCurrency] = useState(initialCurrency);

  const result = useMemo(() => {
    const s = Number(stake);
    const decimal = parseOddsInput(odds, 'decimal');
    if (!Number.isFinite(s) || decimal === null) return null;
    return computeReturns(s, decimal);
  }, [stake, odds]);

  return (
    <section style={card} aria-labelledby="returns-heading">
      <h2 id="returns-heading" style={{ marginTop: 0 }}>
        {t('returnsHeading')}
      </h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('returnsIntro')}
      </p>

      <div style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <label htmlFor="returns-stake" style={label}>
            {t('stake')}
          </label>
          <input
            id="returns-stake"
            style={control}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="returns-odds" style={label}>
            {t('decimalOdds')}
          </label>
          <input
            id="returns-odds"
            style={control}
            type="number"
            min="1"
            step="0.01"
            inputMode="decimal"
            value={odds}
            onChange={(e) => setOdds(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="returns-currency" style={label}>
            {t('currency')}
          </label>
          <select
            id="returns-currency"
            style={control}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div aria-live="polite" style={{ marginTop: '1rem' }}>
        {result ? (
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              rowGap: '0.5rem',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--muted)' }}>{t('totalReturns')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {formatMoney(result.returns, currency)}
            </dd>
            <dt style={{ color: 'var(--muted)' }}>{t('profit')}</dt>
            <dd style={{ margin: 0, fontWeight: 600, color: 'var(--success)' }}>
              {formatMoney(result.profit, currency)}
            </dd>
          </dl>
        ) : (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            {t('enterStake')}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Client-side odds & bet calculator (OB-152). Two independent tools — an
 * odds-format converter and a returns calculator — sharing the pure math in
 * `@overlay/shared/odds`. Initial state is hydrated from query params so a
 * result can be deep-linked/shared.
 */
export default function OddsCalculator() {
  const searchParams = useSearchParams();
  // Snapshot the params once for initial state; inputs are uncontrolled after.
  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );

  return (
    <div
      style={{
        display: 'grid',
        gap: '1.5rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}
    >
      <OddsConverter params={params} />
      <ReturnsCalculator params={params} />
    </div>
  );
}
