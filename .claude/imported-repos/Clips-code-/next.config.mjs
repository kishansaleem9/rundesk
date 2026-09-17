/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Video uploads are streamed to route handlers; keep the body limit generous.
  experimental: {
    serverActions: {
      bodySizeLimit: '512mb',
    },
  },
};

export default nextConfig;
