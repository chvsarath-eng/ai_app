import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker/Cloud Run deployment
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com https://*.paddle.com https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://sandbox-cdn.paddle.com https://cdn.paddle.com",
              "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://sandbox-cdn.paddle.com https://cdn.paddle.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https: http:",
              "frame-src 'self' https://*.paddle.com",
              "connect-src 'self' blob: data: https://*.paddle.com https://www.google-analytics.com https://*.googleapis.com https://*.run.app https://raw.githack.com https://raw.githubusercontent.com",
              "worker-src 'self' blob:",
            ].join('; ')
          }
        ]
      }
    ]
  }
};

export default nextConfig;
