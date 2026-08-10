const createNextIntlPlugin = require('next-intl/plugin');

// Enable next-intl with cookie-based locale selection (no i18n URL routing).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace shared package (TS sources) at build time.
  transpilePackages: ['@overlay/shared'],
  // Emit a self-contained server (.next/standalone) for lean Docker images.
  output: 'standalone',
  // The tipster marketplace was renamed to "Tipsters" (/tipsters); redirect the
  // old path so existing links and search results keep working.
  async redirects() {
    return [
      { source: '/marketplace', destination: '/tipsters', permanent: true },
      // How-it-works content was merged into the About page.
      { source: '/how-it-works', destination: '/about', permanent: true },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
