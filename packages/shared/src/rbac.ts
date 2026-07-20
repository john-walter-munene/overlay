// Role-based access control (RBAC) — the single source of truth for roles,
// permissions, and the mapping between them. Kept dependency-free so the API,
// workers, web app, and tests all share one canonical model.
//
// Design: roles are a coarse identity; authorization is expressed as
// permissions. Routes are gated by permission (not role) so adding a role is a
// one-line change to ROLE_PERMISSIONS and nothing else.

/** Canonical account roles. Mutually exclusive — a user holds exactly one. */
export type Role = 'user' | 'tipster' | 'staff' | 'admin';

export const ROLES: readonly Role[] = ['user', 'tipster', 'staff', 'admin'];

/**
 * Fine-grained capabilities. Endpoints declare the permission(s) they require;
 * a role grants a set of permissions via {@link ROLE_PERMISSIONS}.
 *
 * - `user:manage`      — list users, change a user's role (never escalate).
 * - `tipster:manage`   — suspend/reinstate, graduations, gating, identity docs,
 *                        void picks (pick-integrity correction).
 * - `content:moderate` — reports, feedback, newsletter, articles, free daily tips.
 * - `audit:read`       — read the audit log and admin dashboard.
 * - `data:ingest`      — ingest sports fixtures/events from the data provider.
 * - `finance:manage`   — payouts approve/reject, settlements run/list. Admin only.
 */
export type Permission =
  | 'user:manage'
  | 'tipster:manage'
  | 'content:moderate'
  | 'audit:read'
  | 'data:ingest'
  | 'finance:manage';

/**
 * Role → granted permissions. `staff` is "admin minus finance": it manages
 * users, tipsters, and content but has no `finance:manage`. `admin` is the
 * superset (all permissions).
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  user: [],
  tipster: [],
  staff: [
    'user:manage',
    'tipster:manage',
    'content:moderate',
    'audit:read',
    'data:ingest',
  ],
  admin: [
    'user:manage',
    'tipster:manage',
    'content:moderate',
    'audit:read',
    'data:ingest',
    'finance:manage',
  ],
};

/** All permissions granted to a role (empty for `user`/`tipster`). */
export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Whether a role is granted a specific permission. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

/**
 * Roles an actor may assign to other users — enforces no privilege escalation.
 * `staff` may only ever set `user`/`tipster` (cannot mint admins or peers);
 * `admin` may assign any role.
 */
export const ASSIGNABLE_ROLES: Record<Role, readonly Role[]> = {
  user: [],
  tipster: [],
  staff: ['user', 'tipster'],
  admin: ['user', 'tipster', 'staff', 'admin'],
};

/** Whether `actorRole` is permitted to assign `targetRole` to a user. */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  return ASSIGNABLE_ROLES[actorRole]?.includes(targetRole) ?? false;
}

/**
 * Roles that may only be granted by a trusted source (Supabase `app_metadata`),
 * never self-selected at signup. Used to cap self-service role requests.
 */
export const PRIVILEGED_ROLES: readonly Role[] = ['staff', 'admin'];

/** Whether a role is privileged (admin-granted only, never self-selectable). */
export function isPrivilegedRole(role: Role): boolean {
  return PRIVILEGED_ROLES.includes(role);
}
