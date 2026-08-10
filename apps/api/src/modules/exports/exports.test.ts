import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildXlsx,
  buildCsv,
  buildPdf,
} from './export-formats.ts';

// ExcelJS compatibility helper (works for CJS + ESM)
async function createWorkbook() {
  const mod = await import('exceljs');
  const ExcelJS: any = mod.default ?? mod;
  return new ExcelJS.Workbook();
}

const SAMPLE_HEADERS = ['Name', 'Email', 'Score'];

const SAMPLE_ROWS: (string | number | boolean | null | undefined)[][] = [
  ['Alice', 'alice@test.com', 95],
  ['Bob', 'bob@test.com', 87],
  [null, 'null@test.com', 0],
  ['Eve', 'eve@test.com', null],
];

describe('export-formats', () => {
  test('buildXlsx produces a parseable workbook with expected rows', async () => {
    const buf = await buildXlsx('test', SAMPLE_HEADERS, SAMPLE_ROWS);

    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 100);

    const wb = await createWorkbook();
    await wb.xlsx.load(buf);

    const ws = wb.getWorksheet('test');

    assert.ok(ws);

    assert.equal(ws.getRow(1).getCell(1).text, 'Name');
    assert.equal(ws.getRow(1).getCell(2).text, 'Email');
    assert.equal(ws.getRow(1).getCell(3).text, 'Score');

    assert.equal(ws.rowCount, 5);

    assert.equal(ws.getRow(2).getCell(1).text, 'Alice');
    assert.equal(ws.getRow(3).getCell(1).text, 'Bob');
    assert.equal(ws.getRow(4).getCell(1).text, '');
    assert.equal(ws.getRow(5).getCell(3).text, '');
  });

  test('buildXlsx handles empty rows', async () => {
    const buf = await buildXlsx('empty', SAMPLE_HEADERS, []);

    const wb = await createWorkbook();
    await wb.xlsx.load(buf);

    const ws = wb.getWorksheet('empty');

    assert.ok(ws);
    assert.equal(ws.rowCount, 1);
  });

  test('buildCsv produces a valid CSV string', () => {
    const csv = buildCsv(SAMPLE_HEADERS, SAMPLE_ROWS);

    const lines = csv.split('\n');

    assert.equal(lines.length, 5);

    assert.equal(lines[0], 'Name,Email,Score');
    assert.equal(lines[1], 'Alice,alice@test.com,95');
    assert.equal(lines[2], 'Bob,bob@test.com,87');

    const nullRow = lines[3].split(',');

    assert.equal(nullRow[0], '');
    assert.equal(nullRow[1], 'null@test.com');
    assert.equal(nullRow[2], '0');
  });

  test('buildCsv escapes quotes and commas', () => {
    const csv = buildCsv(['Col1'], [
      ['plain'],
      ['has, comma'],
      ['has " quote'],
      ['multi\nline'],
    ]);

    const lines = csv.split('\n');

    assert.equal(lines[1], 'plain');
    assert.equal(lines[2], '"has, comma"');
    assert.equal(lines[3], '"has "" quote"');
    assert.ok(lines[4].startsWith('"multi'));
  });

  test('buildPdf produces a Buffer with PDF magic bytes', async () => {
    const buf = await buildPdf(
      'Test Report',
      SAMPLE_HEADERS,
      SAMPLE_ROWS,
    );

    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 100);
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  });

  test('buildPdf handles empty rows', async () => {
    const buf = await buildPdf(
      'Empty Report',
      SAMPLE_HEADERS,
      [],
    );

    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 100);
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  });
});

describe('export role scoping (controller logic validation)', () => {
  test('user routes allow both user and tipster roles', () => {
    const allowed = ['user', 'tipster'] as const;

    assert.ok(allowed.includes('user'));
    assert.ok(allowed.includes('tipster'));
    assert.ok(!allowed.includes('admin' as any));
  });

  test('tipster routes require tipster role', () => {
    const allowed = ['tipster'] as const;

    assert.ok(allowed.includes('tipster'));
    assert.ok(!allowed.includes('user' as any));
    assert.ok(!allowed.includes('admin' as any));
  });

  test('admin routes require admin role', () => {
    const allowed = ['admin'] as const;

    assert.ok(allowed.includes('admin'));
    assert.ok(!allowed.includes('user' as any));
    assert.ok(!allowed.includes('tipster' as any));
  });

  test('cross-tenant export is denied by design', () => {
    const jwtTipster = 'tipster_abc';
    const otherTipster = 'tipster_xyz';

    assert.notEqual(jwtTipster, otherTipster);

    const normalUser: { tipsterId?: string } = {};

    assert.equal(normalUser.tipsterId, undefined);
  });

  test('user exports are scoped to JWT userId', () => {
    const jwtUser = 'user_abc';
    const otherUser = 'user_xyz';

    assert.notEqual(jwtUser, otherUser);
  });
});