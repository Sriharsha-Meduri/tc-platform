import type { NextConfig } from 'next';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  transpilePackages: ['@tc/shared', '@tc/api-client'],
  serverExternalPackages: [],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    middlewareClientMaxBodySize: '50mb',
    // Next's rewrite proxy defaults to a 30s upstream timeout (see
    // next/dist/server/lib/router-utils/proxy-request.js). The upload-link
    // documents endpoint runs the full synchronous document-intelligence
    // pipeline (extraction + compliance) for every file, sequentially,
    // before responding — a multi-file batch routinely exceeds 30s even
    // though the backend itself succeeds. Raised well above worst-case
    // multi-file processing time so the proxy never kills a legitimate
    // in-progress upload.
    proxyTimeout: 600_000,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${API_BASE}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
