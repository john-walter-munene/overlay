import Link from 'next/link';

/**
 * Emoji icon for a sport or sport-group name (case/spacing-insensitive).
 * Kept dependency-free; falls back to a target for anything unmapped.
 */
const SPORT_ICONS: Record<string, string> = {
  soccer: '⚽',
  football: '⚽',
  americanfootball: '🏈',
  americanfootballnfl: '🏈',
  basketball: '🏀',
  baseball: '⚾',
  icehockey: '🏒',
  hockey: '🏒',
  tennis: '🎾',
  rugby: '🏉',
  rugbyleague: '🏉',
  rugbyunion: '🏉',
  aussierules: '🏉',
  cricket: '🏏',
  golf: '⛳',
  boxing: '🥊',
  mma: '🥊',
  mixedmartialarts: '🥊',
  motorsport: '🏎️',
  formula1: '🏎️',
  darts: '🎯',
  snooker: '🎱',
  volleyball: '🏐',
  handball: '🤾',
  cycling: '🚴',
};

export function sportIcon(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SPORT_ICONS[key]) return SPORT_ICONS[key];
  // Prefix match (e.g. "soccer_epl" → soccer, "rugbyleaguenrl" → rugby).
  for (const k of Object.keys(SPORT_ICONS)) {
    if (key.startsWith(k)) return SPORT_ICONS[k];
  }
  return '🎯';
}

export interface SportChipItem {
  /** Value used for filtering (sport key or group name). */
  key: string;
  /** Human label shown on the chip. */
  label: string;
  /** Optional count/subtext (e.g. "12 picks"). */
  count?: string;
}

/**
 * A clean, horizontally-scrollable "pick a sport" chip row for server pages
 * (tipsters, daily picks). Each chip is a link that sets the sport filter;
 * the leading "All" chip clears it. For the interactive client discovery
 * surface, {@link SportsDiscovery} renders equivalent button chips.
 */
export function SportChipLinks({
  items,
  activeKey,
  hrefFor,
  allHref,
  allLabel = 'All sports',
  ariaLabel = 'Filter by sport',
}: {
  items: SportChipItem[];
  activeKey?: string | null;
  hrefFor: (key: string) => string;
  allHref: string;
  allLabel?: string;
  ariaLabel?: string;
}) {
  const active = activeKey?.toLowerCase() ?? null;
  return (
    <div className="sport-chips" role="list" aria-label={ariaLabel}>
      <Link
        href={allHref}
        role="listitem"
        className={`sport-chip${!active ? ' is-active' : ''}`}
        aria-current={!active ? 'true' : undefined}
      >
        <span className="sport-chip__icon" aria-hidden>
          🏅
        </span>
        <span>{allLabel}</span>
      </Link>
      {items.map((it) => {
        const isActive = active === it.key.toLowerCase();
        return (
          <Link
            key={it.key}
            href={hrefFor(it.key)}
            role="listitem"
            className={`sport-chip${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <span className="sport-chip__icon" aria-hidden>
              {sportIcon(it.key)}
            </span>
            <span>{it.label}</span>
            {it.count ? <span className="sport-chip__count">{it.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
