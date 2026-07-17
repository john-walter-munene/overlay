'use client';

import { useFollow } from './FollowProvider';

/**
 * Follow / Following toggle for a tipster. Reads shared state from
 * {@link FollowProvider} so many buttons cost one request. Free action —
 * following tracks public performance without unlocking gated picks.
 */
export default function FollowButton({
  tipsterId,
  size = 'md',
  block = false,
}: {
  tipsterId: string;
  size?: 'sm' | 'md';
  block?: boolean;
}) {
  const { ready, isFollowing, toggle } = useFollow();
  const following = isFollowing(tipsterId);

  const className = [
    'btn',
    following ? 'btn--secondary' : 'btn--primary',
    size === 'sm' ? 'btn--sm' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      aria-pressed={following}
      disabled={!ready}
      onClick={() => toggle(tipsterId)}
      style={block ? { width: '100%' } : undefined}
      title={following ? 'Stop tracking this tipster' : 'Track this tipster for free'}
    >
      {following ? '✓ Following' : '+ Follow'}
    </button>
  );
}
