'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProfile } from '../../../lib/auth';
import { roleHasPermission, type Role } from '@overlay/shared/rbac';
import SportsDiscovery from '../../sports/SportsDiscovery';

/**
 * Admin event inventory (data:ingest). Reuses the public discovery surface so
 * staff/admins see exactly what bettors see — every ingested event with its
 * live odds, per-bookmaker comparison, freshness and full market inventory
 * (props flagged view-only) — from one place, alongside the ingest control on
 * the main admin dashboard.
 */
export default function AdminEventsPage() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      if (!roleHasPermission(profile.role as Role, 'data:ingest')) {
        router.replace('/account');
        return;
      }
      setOk(true);
    })();
  }, [router]);

  if (!ok) return null;

  return (
    <div>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '1.5rem 1.5rem 0' }}>
        <Link href="/admin" style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>
          ← Back to admin
        </Link>
        <p style={{ color: 'var(--muted)', margin: '0.75rem 0 0' }}>
          Every ingested event with live odds, bookmaker comparison and full
          market inventory. Use the operations panel on the dashboard to ingest
          more sports.
        </p>
      </div>
      <div style={{ padding: '0 1.5rem 3rem' }}>
        <SportsDiscovery />
      </div>
    </div>
  );
}
