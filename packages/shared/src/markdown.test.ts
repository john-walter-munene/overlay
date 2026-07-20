import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml, stripHtml } from './markdown.ts';

test('keeps safe formatting markup untouched', () => {
  const html = '<p>Hello <strong>world</strong> and <em>value</em>.</p>';
  assert.equal(sanitizeHtml(html), html);
});

test('removes <script> tags and their content', () => {
  const html = '<p>ok</p><script>alert(1)</script>';
  assert.equal(sanitizeHtml(html), '<p>ok</p>');
});

test('removes case-insensitive script tags and content', () => {
  const html = '<p>ok</p><SCRIPT>evil()</SCRIPT>';
  assert.equal(sanitizeHtml(html), '<p>ok</p>');
});

test('strips inline event handler attributes', () => {
  const out = sanitizeHtml('<img src="x.png" onerror="alert(1)">');
  assert.ok(!/onerror/i.test(out));
  assert.ok(out.includes('src="x.png"'));
});

test('strips uppercase/obfuscated event handlers', () => {
  const out = sanitizeHtml('<a href="/a" OnClick="alert(1)">x</a>');
  assert.ok(!/onclick/i.test(out));
  assert.equal(out, '<a href="/a">x</a>');
});

test('drops javascript: hrefs but keeps the link text', () => {
  const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
  assert.ok(!/javascript/i.test(out));
  assert.equal(out, '<a>click</a>');
});

test('drops javascript: urls hidden by whitespace/control chars', () => {
  const out = sanitizeHtml('<a href="java\tscript:alert(1)">x</a>');
  assert.ok(!/alert/i.test(out));
  assert.equal(out, '<a>x</a>');
});

test('drops entity-encoded javascript scheme', () => {
  const out = sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>');
  assert.ok(!/alert/i.test(out));
  assert.equal(out, '<a>x</a>');
});

test('drops data: URIs on images', () => {
  const out = sanitizeHtml(
    '<img src="data:text/html;base64,PHNjcmlwdD4=" alt="x">',
  );
  assert.ok(!/data:/i.test(out));
  assert.ok(out.includes('alt="x"'));
});

test('allows http(s), mailto and relative links', () => {
  assert.ok(sanitizeHtml('<a href="https://a.com">a</a>').includes('href="https://a.com"'));
  assert.ok(sanitizeHtml('<a href="mailto:x@y.com">a</a>').includes('href="mailto:x@y.com"'));
  assert.ok(sanitizeHtml('<a href="/blog/x">a</a>').includes('href="/blog/x"'));
  assert.ok(sanitizeHtml('<a href="#anchor">a</a>').includes('href="#anchor"'));
});

test('removes iframe, svg and object elements with content', () => {
  assert.equal(sanitizeHtml('<iframe src="//evil"></iframe>text'), 'text');
  assert.equal(
    sanitizeHtml('<svg><script>alert(1)</script></svg>done'),
    'done',
  );
  assert.equal(sanitizeHtml('<object data="evil"></object>ok'), 'ok');
});

test('unwraps unknown tags but preserves inner text', () => {
  assert.equal(sanitizeHtml('<foo>bar</foo>'), 'bar');
  assert.equal(sanitizeHtml('<div>content</div>'), 'content');
});

test('strips HTML comments', () => {
  assert.equal(sanitizeHtml('<p>a</p><!-- <script>x</script> -->'), '<p>a</p>');
});

test('preserves allowed image with safe attributes', () => {
  const out = sanitizeHtml('<img src="https://cdn/x.png" alt="cover" title="t">');
  assert.ok(out.includes('src="https://cdn/x.png"'));
  assert.ok(out.includes('alt="cover"'));
  assert.ok(out.includes('title="t"'));
});

test('handles empty and non-tag input', () => {
  assert.equal(sanitizeHtml(''), '');
  assert.equal(sanitizeHtml('just text'), 'just text');
});

// ---------------------------------------------------------------------------
// stripHtml — plain-text sanitizer for fields rendered as text (e.g. bio).
// ---------------------------------------------------------------------------

test('stripHtml removes all tags but keeps visible text', () => {
  assert.equal(stripHtml('Hello <b>there</b> world'), 'Hello there world');
});

test('stripHtml neutralizes a stored XSS payload', () => {
  assert.equal(stripHtml('<script>alert(1)</script>'), '');
  assert.equal(stripHtml('hi<script>alert(1)</script>'), 'hi');
  assert.equal(
    stripHtml('<img src=x onerror=alert(1)>ok'),
    'ok',
  );
  assert.equal(stripHtml('<svg/onload=alert(1)>'), '');
});

test('stripHtml drops style blocks with their content', () => {
  assert.equal(stripHtml('a<style>body{}</style>b'), 'ab');
});

test('stripHtml is case-insensitive for dangerous tags', () => {
  assert.equal(stripHtml('x<SCRIPT>evil()</SCRIPT>y'), 'xy');
});

test('stripHtml preserves a lone less-than that is not a tag', () => {
  assert.equal(stripHtml('5 < 10 and 3 > 2'), '5 < 10 and 3 > 2');
});

test('stripHtml removes an unterminated dangerous tag remnant', () => {
  assert.equal(stripHtml('<script>alert(1)'), '');
  assert.equal(stripHtml('ok<b'), 'ok');
});

test('stripHtml removes comments and declarations', () => {
  assert.equal(stripHtml('a<!-- c -->b'), 'ab');
});

test('stripHtml handles empty and plain input', () => {
  assert.equal(stripHtml(''), '');
  assert.equal(stripHtml('just text'), 'just text');
});

test('stripHtml is not defeated by split/nested tag payloads', () => {
  // A single-pass string replace could re-expose a tag here; the scanner must not.
  for (const payload of [
    '<scr<script>ipt>alert(1)</script>',
    '<<script>script>alert(1)<</script>/script>',
    '<img/src=x onerror=alert(1)>',
  ]) {
    const out = stripHtml(payload);
    assert.ok(!/<\s*script/i.test(out), `residual script tag in: ${out}`);
    assert.ok(!/onerror/i.test(out), `residual handler in: ${out}`);
  }
});
