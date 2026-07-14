'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { API_URL } from './api';

/** Resolved local profile returned by GET /api/auth/me. */
export interface Profile {
  userId: string;
  role: 'user' | 'tipster' | 'admin';
  tipsterId?: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Consume the #access_token hash from email-confirmation / OAuth links.
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Current Supabase access token (JWT the API verifies), or null. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Authenticated fetch that attaches the Supabase access token. */
export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
}

/**
 * Sign up with Supabase. The chosen role is stored in user_metadata so the API
 * provisions the right local role on first authenticated request. Returns
 * needsConfirmation=true when email confirmation is required (no session yet).
 */
export async function signUp(
  email: string,
  password: string,
  role: 'user' | 'tipster',
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase().auth.signUp({
    email,
    password,
    options: {
      data: { role },
      // Email-confirmation link returns here to establish the session.
      emailRedirectTo:
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : undefined,
    },
  });
  if (error) throw new Error(error.message);
  return { needsConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

/** Fetch the resolved app profile (role, tipsterId) from the API, or null. */
export async function getProfile(): Promise<Profile | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await authFetch('/api/auth/me');
  if (!res.ok) return null;
  return (await res.json()) as Profile;
}

/** Enriched self-profile for the account page. */
export interface FullProfile {
  userId: string;
  email: string;
  username: string | null;
  role: 'user' | 'tipster' | 'admin';
  createdAt: string;
  tipsterId: string | null;
  subscriptionCount: number;
}

export async function getFullProfile(): Promise<FullProfile | null> {
  const res = await authFetch('/api/users/me');
  if (!res.ok) return null;
  return (await res.json()) as FullProfile;
}

export async function checkUsername(
  u: string,
): Promise<{ available: boolean; valid: boolean }> {
  const res = await authFetch(
    `/api/users/username-available?u=${encodeURIComponent(u)}`,
  );
  if (!res.ok) return { available: false, valid: false };
  return (await res.json()) as { available: boolean; valid: boolean };
}

export async function updateUsername(username: string): Promise<FullProfile> {
  const res = await authFetch('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    throw new Error(
      Array.isArray(body.message)
        ? body.message[0]
        : body.message ?? 'Failed to update username',
    );
  }
  return (await res.json()) as FullProfile;
}

/** Change password for the signed-in user (Supabase). */
export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/** Change email — Supabase sends a confirmation link to the new address. */
export async function changeEmail(newEmail: string): Promise<void> {
  const { error } = await supabase().auth.updateUser(
    { email: newEmail },
    {
      emailRedirectTo:
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : undefined,
    },
  );
  if (error) throw new Error(error.message);
}

/** Send a password-reset email (logged-out flow). */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase().auth.resetPasswordForEmail(email, {
    redirectTo:
      typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : undefined,
  });
  if (error) throw new Error(error.message);
}

/** Notification channel/cadence preferences (GET/PUT /api/notifications/preferences). */
export interface NotificationPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
  frequency: 'instant' | 'daily';
}

export async function getNotificationPreferences(): Promise<NotificationPreferences | null> {
  const res = await authFetch('/api/notifications/preferences');
  if (!res.ok) return null;
  return (await res.json()) as NotificationPreferences;
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const res = await authFetch('/api/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to save notification preferences');
  return (await res.json()) as NotificationPreferences;
}

/** Download the caller's full personal-data export as a JSON file (GDPR). */
export async function exportMyData(): Promise<void> {
  const res = await authFetch('/api/privacy/export');
  if (!res.ok) throw new Error('Failed to export your data');
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `overlay-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Erase the caller's account (anonymizes PII), then sign out. */
export async function deleteMyAccount(): Promise<void> {
  const res = await authFetch('/api/privacy/me', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete your account');
  await signOut();
}
