'use client';

/**
 * Tiny client-side store backing the tipster "compare" tray (OB-160). Selection
 * is capped at three, persisted to localStorage (survives navigation between the
 * marketplace and profiles) and broadcast via a custom event so the per-row
 * toggles and the sticky tray stay in sync without a shared React tree.
 */

export interface CompareItem {
  id: string;
  name: string;
}

const KEY = 'overlay.compare';
const EVENT = 'overlay-compare-change';
export const COMPARE_MAX = 3;

export function getCompare(): CompareItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (i): i is CompareItem =>
            !!i &&
            typeof (i as CompareItem).id === 'string' &&
            typeof (i as CompareItem).name === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function save(items: CompareItem[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function isSelected(id: string): boolean {
  return getCompare().some((i) => i.id === id);
}

/** Toggle an item. Returns the resulting selected state. No-op when at cap. */
export function toggleCompare(item: CompareItem): boolean {
  const items = getCompare();
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    items.splice(idx, 1);
    save(items);
    return false;
  }
  if (items.length >= COMPARE_MAX) return false;
  items.push(item);
  save(items);
  return true;
}

export function removeCompare(id: string): void {
  save(getCompare().filter((i) => i.id !== id));
}

export function clearCompare(): void {
  save([]);
}

/** Subscribe to selection changes (same-tab custom event + cross-tab storage). */
export function subscribeCompare(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
