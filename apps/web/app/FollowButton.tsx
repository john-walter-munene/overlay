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
  iconOnly = false,
}: {
  tipsterId: string;
  size?: 'sm' | 'md';
  block?: boolean;
  iconOnly?: boolean;
}) {
  const { ready, isFollowing, toggle } = useFollow();
  const following = isFollowing(tipsterId);

  const title = following
    ? 'Following — tracking this tipster’s performance record for free. Click to stop. (Doesn’t unlock premium picks — subscribe for those.)'
    : 'Follow to track this tipster’s performance record for free. Doesn’t unlock premium picks — subscribe for those.';

  if (iconOnly) {
    return (
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        aria-pressed={following}
        aria-label={following ? 'Following (click to unfollow)' : 'Follow to track for free'}
        disabled={!ready}
        onClick={() => toggle(tipsterId)}
        title={title}
        style={{
          width: 34,
          height: 34,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
          lineHeight: 1,
          color: following ? 'var(--accent)' : 'var(--fg)',
        }}
      >
        {following ? '✓' : '+'}
      </button>
    );
  }

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
      title={title}
    >
      {following ? '✓ Following' : '+ Follow'}
    </button>
  );
}
