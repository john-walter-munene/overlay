import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from '../app/EmptyState.ts';

test('EmptyState renders title, description and CTA when data is empty', () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      icon: '📭',
      title: 'No picks yet',
      description: 'Subscribe to a tipster and their live picks show up here.',
      actions: [{ href: '/tipsters', label: 'Browse tipsters' }],
    }),
  );

  assert.match(html, /No picks yet/);
  assert.match(html, /Subscribe to a tipster/);
  // CTA renders as a button-styled link to the destination.
  assert.match(html, /href="\/tipsters"/);
  assert.match(html, /Browse tipsters/);
  // Announced to assistive tech so an empty screen isn't silent.
  assert.match(html, /role="status"/);
});

test('EmptyState renders without an icon, description, or actions', () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, { title: 'Nothing here' }),
  );

  assert.match(html, /Nothing here/);
  // No actions container / anchors when none are provided.
  assert.doesNotMatch(html, /<a /);
});

test('EmptyState defaults the first action to primary and the rest to secondary', () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      title: 'No subscriptions yet',
      actions: [
        { href: '/tipsters', label: 'Browse tipsters' },
        { href: '/how-it-works', label: 'How it works' },
      ],
    }),
  );

  assert.match(html, /class="btn btn--primary btn--sm"[^>]*>Browse tipsters/);
  assert.match(html, /class="btn btn--secondary btn--sm"[^>]*>How it works/);
});
