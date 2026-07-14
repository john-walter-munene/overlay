// Pure, dependency-free HTML sanitizer for rendered markdown (blog articles).
//
// Markdown is parsed to HTML elsewhere (e.g. `marked` in the web app); the
// resulting HTML is untrusted because authors may embed raw HTML, malicious
// links or image handlers. `sanitizeHtml` applies a strict allowlist so the
// output is safe to inject with `dangerouslySetInnerHTML`.
//
// It is written without any dependencies so it can be unit-tested with Node's
// native type-stripping test runner.

/** Tags whose markup AND text content are dropped entirely. */
const DROP_CONTENT_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'noembed',
  'template',
  'title',
  'textarea',
  'xmp',
  'svg',
  'math',
  'frame',
  'frameset',
  'applet',
  'base',
  'link',
  'meta',
]);

/** Self-closing/void elements that must not emit a closing tag. */
const VOID_TAGS = new Set(['br', 'hr', 'img']);

/** Allowed tags mapped to the attributes permitted on each. */
const ALLOWED: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  p: new Set(),
  br: new Set(),
  hr: new Set(),
  blockquote: new Set(),
  pre: new Set(['class']),
  code: new Set(['class']),
  kbd: new Set(),
  samp: new Set(),
  var: new Set(),
  h1: new Set(),
  h2: new Set(),
  h3: new Set(),
  h4: new Set(),
  h5: new Set(),
  h6: new Set(),
  strong: new Set(),
  b: new Set(),
  em: new Set(),
  i: new Set(),
  del: new Set(),
  s: new Set(),
  ins: new Set(),
  mark: new Set(),
  small: new Set(),
  sub: new Set(),
  sup: new Set(),
  ul: new Set(),
  ol: new Set(['start']),
  li: new Set(),
  dl: new Set(),
  dt: new Set(),
  dd: new Set(),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  table: new Set(),
  thead: new Set(),
  tbody: new Set(),
  tfoot: new Set(),
  tr: new Set(),
  th: new Set(['align', 'colspan', 'rowspan']),
  td: new Set(['align', 'colspan', 'rowspan']),
  span: new Set(['class']),
};

/** URL schemes permitted on href/src attributes. */
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
  sol: '/',
};

function fromCode(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Decode the subset of HTML entities relevant to attribute-value smuggling. */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => fromCode(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => fromCode(parseInt(dec, 10)))
    .replace(/&([a-z]+);?/gi, (m, name) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];
      return decoded ?? m;
    });
}

/** Re-escape an attribute value for safe emission inside double quotes. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Return a safe version of a URL, or null if it must be dropped.
 * Blocks `javascript:`, `data:`, `vbscript:` and other unknown schemes while
 * allowing http(s)/mailto/tel, relative, protocol-relative and fragment URLs.
 */
function sanitizeUrl(raw: string): string | null {
  // Strip control chars and whitespace that can split a scheme (e.g. "java\tscript:").
  const stripped = raw.replace(/[\u0000-\u0020\u007f]+/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(stripped);
  if (scheme && !ALLOWED_SCHEMES.has(scheme[1].toLowerCase())) return null;
  return raw.trim();
}

/** Parse an opening tag's attribute segment into [name, value] pairs. */
function parseAttrs(segment: string): [string, string][] {
  const re =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const out: [string, string][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) {
    if (m.index === re.lastIndex) re.lastIndex++;
    if (!m[1]) continue;
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    out.push([m[1], decodeEntities(value)]);
  }
  return out;
}

/**
 * Sanitize an HTML string against a strict allowlist of tags and attributes.
 * Unknown tags are unwrapped (their text kept); dangerous tags and their
 * content are removed; event handlers and unsafe URLs are stripped.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  let out = '';
  let i = 0;
  const n = input.length;

  while (i < n) {
    const lt = input.indexOf('<', i);
    if (lt === -1) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, lt);

    // Comments.
    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    // Declarations / processing instructions (<!doctype>, <?xml ?>).
    if (input[lt + 1] === '!' || input[lt + 1] === '?') {
      const end = input.indexOf('>', lt + 1);
      i = end === -1 ? n : end + 1;
      continue;
    }

    // Find the end of the tag, respecting quoted attribute values.
    let j = lt + 1;
    let quote = '';
    while (j < n) {
      const c = input[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    if (j >= n) break; // unterminated tag: drop the remainder

    const rawTag = input.slice(lt + 1, j);
    i = j + 1;

    const isClose = rawTag[0] === '/';
    const bodyStr = isClose ? rawTag.slice(1) : rawTag;
    const nameMatch = /^([a-zA-Z][a-zA-Z0-9]*)/.exec(bodyStr);
    if (!nameMatch) continue; // malformed tag: drop markup
    const name = nameMatch[1].toLowerCase();

    if (DROP_CONTENT_TAGS.has(name)) {
      if (!isClose && !/\/\s*$/.test(bodyStr)) {
        const closeRe = new RegExp(`</\\s*${name}\\s*>`, 'i');
        const rest = input.slice(i);
        const m = closeRe.exec(rest);
        i = m ? i + m.index + m[0].length : n;
      }
      continue;
    }

    const allowedAttrs = ALLOWED[name];
    if (!allowedAttrs) continue; // unknown tag: unwrap (keep children)

    if (isClose) {
      out += `</${name}>`;
      continue;
    }

    let attrStr = '';
    for (const [key, value] of parseAttrs(bodyStr.slice(nameMatch[1].length))) {
      const k = key.toLowerCase();
      if (!allowedAttrs.has(k)) continue;
      if (k === 'href' || k === 'src') {
        const safe = sanitizeUrl(value);
        if (safe === null) continue;
        attrStr += ` ${k}="${escapeAttr(safe)}"`;
      } else {
        attrStr += ` ${k}="${escapeAttr(value)}"`;
      }
    }

    out += VOID_TAGS.has(name)
      ? `<${name}${attrStr} />`
      : `<${name}${attrStr}>`;
  }

  return out;
}
