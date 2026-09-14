/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep production builds resilient: lint is available via `npm run lint`,
  // but a style nit shouldn't block a deploy.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
