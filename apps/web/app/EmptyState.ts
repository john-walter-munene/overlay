import { createElement, type ReactNode } from 'react';

/**
 * A single call-to-action shown inside an {@link EmptyState}. Rendered as a
 * button-styled anchor so it works in server components and in the plain
 * (Next-free) render used by the component test.
 */
export interface EmptyStateAction {
  /** Destination for the CTA link. */
  href: string;
  /** Visible label. */
  label: string;
  /** Button style; defaults to `primary` for the first action. */
  variant?: 'primary' | 'secondary' | 'ghost';
}

export interface EmptyStateProps {
  /** Optional decorative glyph/emoji shown above the title. */
  icon?: ReactNode;
  /** Short, friendly headline (e.g. "No picks yet"). */
  title: string;
  /** One or two lines explaining what will appear here and why it's empty. */
  description?: ReactNode;
  /** Zero or more CTAs guiding the user to fill the empty state. */
  actions?: EmptyStateAction[];
  /** Extra classes appended to the panel wrapper. */
  className?: string;
}

/**
 * Friendly empty state (OB-014). A reusable, centred panel with an optional
 * icon, a title, supporting copy, and one or more call-to-action links. Used
 * across the feed, dashboard, and subscriptions pages so a first-run user
 * always sees a helpful next step instead of a blank screen.
 *
 * Authored with `createElement` (no JSX) so it can be imported by both the
 * Next.js app and the plain Node test runner used for unit tests.
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  const children: ReactNode[] = [];

  if (icon != null) {
    children.push(
      createElement(
        'div',
        {
          key: 'icon',
          'aria-hidden': true,
          style: { fontSize: '2rem', lineHeight: 1 },
        },
        icon,
      ),
    );
  }

  children.push(
    createElement(
      'h2',
      { key: 'title', style: { margin: 0, fontSize: '1.15rem' } },
      title,
    ),
  );

  if (description != null) {
    children.push(
      createElement(
        'p',
        {
          key: 'description',
          style: { color: 'var(--muted)', margin: 0, maxWidth: '42ch' },
        },
        description,
      ),
    );
  }

  if (actions && actions.length > 0) {
    children.push(
      createElement(
        'div',
        {
          key: 'actions',
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            marginTop: '0.25rem',
          },
        },
        actions.map((action, i) =>
          createElement(
            'a',
            {
              key: `${action.href}-${action.label}`,
              href: action.href,
              className: `btn btn--${action.variant ?? (i === 0 ? 'primary' : 'secondary')} btn--sm`,
            },
            action.label,
          ),
        ),
      ),
    );
  }

  return createElement(
    'div',
    {
      className: className ? `panel empty-state ${className}` : 'panel empty-state',
      role: 'status',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.6rem',
        textAlign: 'center',
      },
    },
    children,
  );
}

export default EmptyState;
