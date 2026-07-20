import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  ROLE_PERMISSIONS,
  permissionsForRole,
  roleHasPermission,
  canAssignRole,
  isPrivilegedRole,
} from './rbac.ts';

test('staff is admin-minus-finance: has every permission except finance:manage', () => {
  const staff = permissionsForRole('staff');
  assert.ok(staff.includes('user:manage'));
  assert.ok(staff.includes('tipster:manage'));
  assert.ok(staff.includes('content:moderate'));
  assert.ok(staff.includes('audit:read'));
  assert.ok(staff.includes('data:ingest'));
  assert.equal(staff.includes('finance:manage'), false);
});

test('admin holds every permission (superset)', () => {
  assert.ok(roleHasPermission('admin', 'finance:manage'));
  assert.ok(roleHasPermission('admin', 'user:manage'));
  assert.ok(roleHasPermission('admin', 'tipster:manage'));
  assert.ok(roleHasPermission('admin', 'content:moderate'));
  assert.ok(roleHasPermission('admin', 'audit:read'));
  assert.ok(roleHasPermission('admin', 'data:ingest'));
});

test('user and tipster hold no admin permissions', () => {
  for (const role of ['user', 'tipster'] as const) {
    assert.equal(permissionsForRole(role).length, 0);
    assert.equal(roleHasPermission(role, 'user:manage'), false);
    assert.equal(roleHasPermission(role, 'finance:manage'), false);
  }
});

test('staff cannot touch finance; only admin can', () => {
  assert.equal(roleHasPermission('staff', 'finance:manage'), false);
  assert.equal(roleHasPermission('admin', 'finance:manage'), true);
});

test('staff can ingest sports data (data:ingest), users/tipsters cannot', () => {
  assert.equal(roleHasPermission('staff', 'data:ingest'), true);
  assert.equal(roleHasPermission('admin', 'data:ingest'), true);
  assert.equal(roleHasPermission('tipster', 'data:ingest'), false);
  assert.equal(roleHasPermission('user', 'data:ingest'), false);
});

test('no privilege escalation: staff may only assign user/tipster', () => {
  assert.ok(canAssignRole('staff', 'user'));
  assert.ok(canAssignRole('staff', 'tipster'));
  assert.equal(canAssignRole('staff', 'staff'), false);
  assert.equal(canAssignRole('staff', 'admin'), false);
});

test('admin may assign any role', () => {
  for (const target of ROLES) {
    assert.ok(canAssignRole('admin', target));
  }
});

test('non-admin/staff roles may assign nothing', () => {
  for (const actor of ['user', 'tipster'] as const) {
    for (const target of ROLES) {
      assert.equal(canAssignRole(actor, target), false);
    }
  }
});

test('privileged roles (staff, admin) are never self-selectable', () => {
  assert.ok(isPrivilegedRole('staff'));
  assert.ok(isPrivilegedRole('admin'));
  assert.equal(isPrivilegedRole('user'), false);
  assert.equal(isPrivilegedRole('tipster'), false);
});

test('every declared role has a permission entry', () => {
  for (const role of ROLES) {
    assert.ok(ROLE_PERMISSIONS[role] !== undefined);
  }
});
