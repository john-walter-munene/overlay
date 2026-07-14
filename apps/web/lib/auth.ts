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
