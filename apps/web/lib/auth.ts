'use client';

import { API_URL } from './api';

const TOKEN_KEY = 'ob_token';

export interface SessionClaims {
  sub: string;
  role: 'user' | 'tipster' | 'admin';
  tipsterId?: string;
  exp?: number;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Decode JWT claims client-side (no verification — display/UX only). */
export function decodeSession(token: string | null): SessionClaims | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as SessionClaims;
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function currentSession(): SessionClaims | null {
  return decodeSession(getToken());
}

/** Authenticated fetch that attaches the bearer token. */
export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string }> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Invalid email or password');
  return res.json();
}

export async function register(
  email: string,
  password: string,
  role: 'user' | 'tipster',
): Promise<{ token: string }> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  if (!res.ok) {
    const msg =
      res.status === 409
        ? 'That email is already registered'
        : 'Registration failed';
    throw new Error(msg);
  }
  return res.json();
}
