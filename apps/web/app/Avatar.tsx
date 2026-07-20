/**
 * User/tipster avatar. Shows the uploaded/chosen image when present, otherwise
 * a deterministic generated avatar (DiceBear) seeded by the username so it's
 * stable per user.
 *
 * Plain <img> (not next/image) so no domain config is needed and it works in
 * both server and client components.
 */
import { useRef } from 'react';
import { generatedAvatarUrl } from '../lib/avatar';

export default function Avatar({
  src,
  seed,
  size = 40,
  alt = '',
  style,
}: {
  src?: string | null;
  seed?: string | null;
  size?: number;
  alt?: string;
  style?: React.CSSProperties;
}) {
  // Track src changes so we only bump the cache-buster when the URL actually
  // changes (not on every render). This prevents the browser from cancelling
  // in-flight requests due to a constantly-changing src.
  const versionRef = useRef(0);
  const prevSrcRef = useRef(src);
  if (src !== prevSrcRef.current) {
    versionRef.current += 1;
    prevSrcRef.current = src;
  }

  const isGenerated = !src || src.startsWith('https://api.dicebear.com/');
  const url = src && src.length > 0 ? src : generatedAvatarUrl(seed);

  // Attach a unique cache-buster query param for user-uploaded avatars so the
  // browser re-fetches the image after it has been updated on the server.
  const imgSrc = isGenerated
    ? url
    : `${url}${url.includes('?') ? '&' : '?'}_v=${versionRef.current}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={alt}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
