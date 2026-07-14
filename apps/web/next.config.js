/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the workspace's shared TypeScript package on the fly.
  transpilePackages: ['@overlay/shared'],
  // Emit a self-contained server (.next/standalone) for lean Docker images.
  output: 'standalone',
};

module.exports = nextConfig;
