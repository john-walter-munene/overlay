import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  buildDateStrip,
  diffInDays,
  formatLongDate,
  formatShortDate,
  parseIsoDate,
  relativeDayLabel,
  todayIsoDate,
  toIsoDate,
} from './daily-tips.ts';

test('toIsoDate formats a Date as a UTC YYYY-MM-DD', () => {
  assert.equal(toIsoDate(new Date('2026-03-04T23:30:00.000Z')), '2026-03-04');
  assert.equal(toIsoDate(new Date(Date.UTC(2026, 0, 9))), '2026-01-09');
});

test('parseIsoDate accepts real calendar days and trims whitespace', () => {
  assert.equal(parseIsoDate(' 2026-03-04 '), '2026-03-04');
  assert.equal(parseIsoDate('2024-02-29'), '2024-02-29'); // leap day
});

test('parseIsoDate rejects malformed or impossible dates', () => {
  assert.equal(parseIsoDate(''), null);
  assert.equal(parseIsoDate(null), null);
  assert.equal(parseIsoDate('2026-13-01'), null);
  assert.equal(parseIsoDate('2026-02-31'), null);
  assert.equal(parseIsoDate('2026/03/04'), null);
  assert.equal(parseIsoDate('not-a-date'), null);
});

test('todayIsoDate uses the UTC day of the supplied instant', () => {
  assert.equal(todayIsoDate(new Date('2026-07-15T07:11:00.000Z')), '2026-07-15');
});

test('addDays moves forward and backward across month boundaries', () => {
  assert.equal(addDays('2026-03-04', 1), '2026-03-05');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); // leap year
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('diffInDays returns signed whole-day differences', () => {
  assert.equal(diffInDays('2026-03-05', '2026-03-04'), 1);
  assert.equal(diffInDays('2026-03-04', '2026-03-05'), -1);
  assert.equal(diffInDays('2026-03-04', '2026-03-04'), 0);
});

test('relativeDayLabel renders Yesterday/Today/Tomorrow around today', () => {
  const today = '2026-03-04';
  assert.equal(relativeDayLabel('2026-03-03', today), 'Yesterday');
  assert.equal(relativeDayLabel('2026-03-04', today), 'Today');
  assert.equal(relativeDayLabel('2026-03-05', today), 'Tomorrow');
});

test('relativeDayLabel uses weekday names later in the same week', () => {
  const today = '2026-03-04'; // Wednesday
  assert.equal(relativeDayLabel('2026-03-06', today), 'Friday');
});

test('relativeDayLabel falls back to a short date when far from today', () => {
  const today = '2026-03-04';
  assert.equal(relativeDayLabel('2026-03-20', today), formatShortDate('2026-03-20'));
  assert.equal(relativeDayLabel('2026-02-01', today), formatShortDate('2026-02-01'));
});

test('formatShortDate and formatLongDate render UTC calendar days', () => {
  assert.equal(formatShortDate('2026-03-04'), 'Mar 4, 2026');
  assert.equal(formatLongDate('2026-03-04'), 'Wednesday, March 4, 2026');
});

test('buildDateStrip centres on the selected day with correct labels', () => {
  const strip = buildDateStrip('2026-03-04', '2026-03-04');
  assert.deepEqual(
    strip.map((d) => d.label),
    ['Yesterday', 'Today', 'Tomorrow'],
  );
  assert.deepEqual(
    strip.map((d) => d.date),
    ['2026-03-03', '2026-03-04', '2026-03-05'],
  );
  assert.deepEqual(
    strip.map((d) => d.isToday),
    [false, true, false],
  );
  assert.deepEqual(
    strip.map((d) => d.isSelected),
    [false, true, false],
  );
});

test('buildDateStrip flags today and selection independently', () => {
  // Viewing "tomorrow" while today stays highlighted separately.
  const strip = buildDateStrip('2026-03-05', '2026-03-04');
  assert.deepEqual(
    strip.map((d) => d.date),
    ['2026-03-04', '2026-03-05', '2026-03-06'],
  );
  assert.deepEqual(
    strip.map((d) => d.label),
    ['Today', 'Tomorrow', 'Friday'],
  );
  assert.deepEqual(
    strip.map((d) => d.isToday),
    [true, false, false],
  );
  assert.deepEqual(
    strip.map((d) => d.isSelected),
    [false, true, false],
  );
});

test('buildDateStrip honours a wider radius', () => {
  const strip = buildDateStrip('2026-03-04', '2026-03-04', 2);
  assert.equal(strip.length, 5);
  assert.deepEqual(
    strip.map((d) => d.date),
    ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'],
  );
});

test('buildDateStrip falls back to today for an invalid selection', () => {
  const strip = buildDateStrip('bogus', '2026-03-04');
  assert.equal(strip[1].date, '2026-03-04');
  assert.equal(strip[1].isSelected, true);
});
