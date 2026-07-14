'use client';

import { useEffect, useState } from 'react';
import { authFetch, getAccessToken } from '../../../lib/auth';
import type { LivePick } from '../../../lib/api';
import SubscribeButton from '../../SubscribeButton';

const MUTED = '#9aa4b2';
const BORDER = '#1c2430';

type State =
  | { kind: 'loading' }
  | { kind: 'entitled'; picks: LivePick[] }
  | { kind: 'locked' }
  | { kind: 'signedout' }
  | { kind: 'error' };

/**
 * Gated live-picks panel (OB-011). Subscribers see the tipster's live
 * (pre-event, still-pending) picks; everyone else sees a paywall preview with a
 * subscribe CTA. Entitlement is resolved by the API: GET .../live returns 403
 * without an active subscription, which we render as the preview.
 */
export default function LivePicks({
  tipsterId,
  priceCents,
}: {
  tipsterId: string;
  priceCents: number;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      if (cancelled) return;
      if (!token) {
        setState({ kind: 'signedout' });
        return;
      }
      try {
        const res = await authFetch(
          `/api/picks/tipster/${encodeURIComponent(tipsterId)}/live`,
        );
        if (cancelled) return;
        if (res.status === 403) {
          setState({ kind: 'locked' });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error' });
          return;
        }
        const picks = (await res.json()) as LivePick[];
        if (!cancelled) setState({ kind: 'entitled', picks });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tipsterId]);

  return (
    <section aria-labelledby="live-picks-heading" style={{ marginTop: '2rem' }}>
      <h2 id="live-picks-heading">Live picks</h2>

      {state.kind === 'loading' ? (
        <p style={{ color: MUTED }}>Checking your access…</p>
      ) : state.kind === 'error' ? (
        <p style={{ color: MUTED }}>Couldn’t load live picks right now.</p>
      ) : state.kind === 'entitled' ? (
        <EntitledPicks picks={state.picks} />
      ) : (
        <Paywall
          tipsterId={tipsterId}
          priceCents={priceCents}
          signedOut={state.kind === 'signedout'}
        />
      )}
    </section>
  );
}

function EntitledPicks({ picks }: { picks: LivePick[] }) {
  const live = picks.filter((p) => p.status === 'pending');
  if (live.length === 0) {
    return (
      <p style={{ color: MUTED }}>
        No open picks right now. You’ll see this tipster’s next pick here the
        moment it’s locked.
      </p>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ textAlign: 'left', color: MUTED }}>
          <th style={{ padding: '0.5rem 0' }}>Selection</th>
          <th>Market</th>
          <th>Odds</th>
          <th>Stake</th>
          <th>Locked</th>
        </tr>
      </thead>
      <tbody>
        {live.map((p) => (
          <tr key={p.id} style={{ borderTop: `1px solid ${BORDER}` }}>
            <td style={{ padding: '0.5rem 0' }}>{p.selection}</td>
            <td>{p.market}</td>
            <td>{p.oddsAtPick.toFixed(2)}</td>
            <td>{p.stakeUnits}u</td>
            <td>{new Date(p.lockedAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Paywall({
  tipsterId,
  priceCents,
  signedOut,
}: {
  tipsterId: string;
  priceCents: number;
  signedOut: boolean;
}) {
  return (
    <div
      style={{
        position: 'relative',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '1.5rem',
        overflow: 'hidden',
      }}
    >
      {/* Blurred, non-readable preview of what a subscriber would see. */}
      <div
        aria-hidden="true"
        style={{
          filter: 'blur(6px)',
          opacity: 0.5,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0.5rem 0',
              borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
            }}
          >
            <span>●●●●● ●●●●●●●</span>
            <span>●.●●</span>
            <span>●●●●●●</span>
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          marginTop: '0.5rem',
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
          🔒 Live picks are for subscribers
        </p>
        <p style={{ color: MUTED, marginTop: 0 }}>
          {signedOut
            ? 'Sign in and subscribe to see this tipster’s picks the moment they’re locked — before the event starts.'
            : 'Subscribe to see this tipster’s picks the moment they’re locked — before the event starts.'}
        </p>
        <div style={{ display: 'inline-block', marginTop: '0.5rem' }}>
          <SubscribeButton tipsterId={tipsterId} priceCents={priceCents} />
        </div>
      </div>
    </div>
  );
}
