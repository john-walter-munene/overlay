/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server (.next/standalone) for lean Docker images.
  output: 'standalone',
};

module.exports = nextConfig;
