'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  followTipster,
  getAccessToken,
  listFollowingIds,
  unfollowTipster,
} from '../lib/auth';

interface FollowContextValue {
  /** True once the initial following-set has loaded. */
  ready: boolean;
  signedIn: boolean;
  isFollowing: (tipsterId: string) => boolean;
  /** Toggle follow state (optimistic). Redirects anonymous users to sign in. */
  toggle: (tipsterId: string) => Promise<void>;
}

const FollowContext = createContext<FollowContextValue | null>(null);

/** Access follow state/actions. Falls back to a no-op when no provider (SSR). */
export function useFollow(): FollowContextValue {
  return (
    useContext(FollowContext) ?? {
      ready: false,
      signedIn: false,
      isFollowing: () => false,
      toggle: async () => {},
    }
  );
}

/**
 * Loads the signed-in user's followed tipster ids once and shares them with
 * every {@link FollowButton} on the page, so a marketplace of N tipsters costs
 * a single request rather than N. Updates are optimistic with rollback.
 */
export default function FollowProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const token = await getAccessToken();
      if (!active) return;
      setSignedIn(Boolean(token));
      if (token) {
        const list = await listFollowingIds();
        if (!active) return;
        setIds(new Set(list));
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const isFollowing = useCallback(
    (tipsterId: string) => ids.has(tipsterId),
    [ids],
  );

  const toggle = useCallback(
    async (tipsterId: string) => {
      const token = await getAccessToken();
      if (!token) {
        router.push(`/login?next=/tipsters/${tipsterId}`);
        return;
      }
      const wasFollowing = ids.has(tipsterId);
      setIds((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.delete(tipsterId);
        else next.add(tipsterId);
        return next;
      });
      try {
        if (wasFollowing) await unfollowTipster(tipsterId);
        else await followTipster(tipsterId);
      } catch {
        // Roll back on failure.
        setIds((prev) => {
          const next = new Set(prev);
          if (wasFollowing) next.add(tipsterId);
          else next.delete(tipsterId);
          return next;
        });
      }
    },
    [ids, router],
  );

  return (
    <FollowContext.Provider value={{ ready, signedIn, isFollowing, toggle }}>
      {children}
    </FollowContext.Provider>
  );
}
