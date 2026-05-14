import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: false,
  async headers() {
    const carrierProxyHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Connection', value: 'keep-alive' },
      { key: 'Vary', value: 'Accept-Encoding' },
    ];

    return [
      {
        source: '/api/:path*',
        headers: [
          ...carrierProxyHeaders,
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
      {
        source: '/:path*',
        headers: carrierProxyHeaders,
      },
    ];
  },
};

export default nextConfig;
