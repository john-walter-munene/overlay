import { countryName } from '@overlay/shared/countries';

/**
 * Renders a country flag as a self-hosted SVG (via flag-icons) so it displays
 * on every platform — including Windows, which has no flag emoji glyphs and
 * would otherwise show the raw two-letter code (e.g. "GB").
 *
 * Returns null for missing/invalid codes so callers can render it inline
 * without guarding first.
 */
export default function Flag({
  code,
  className,
  style,
}: {
  code: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  const cc = code.toLowerCase();
  const label = countryName(code) || code.toUpperCase();
  return (
    <span
      className={`fi fi-${cc}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={label}
      title={label}
      style={{ borderRadius: '2px', ...style }}
    />
  );
}
