import type { MetadataRoute } from 'next';

// PWA web app manifest. Icons are served from apps/web/public/ (see the logo
// asset checklist). Colours mirror the dark-theme tokens in globals.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Overlay Picks',
    short_name: 'Overlay Picks',
    description:
      'Verified sports tipster marketplace — tipsters ranked by real ROI and closing line value.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c0b0a',
    theme_color: '#0c0b0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
