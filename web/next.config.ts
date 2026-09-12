import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker/Cloud Run deployment
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/gallery/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ]
      },
      {
        source: '/Gallery_books/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800' }
        ]
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              // Razorpay Checkout + Firebase Auth (Google sign-in popup/redirect) are allowed explicitly.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://checkout.razorpay.com https://*.razorpay.com https://apis.google.com https://www.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https: http:",
              "frame-src 'self' https://api.razorpay.com https://*.razorpay.com https://*.firebaseapp.com https://accounts.google.com",
              "connect-src 'self' blob: data: https://www.google-analytics.com https://*.googleapis.com https://*.run.app https://raw.githack.com https://raw.githubusercontent.com https://*.razorpay.com https://lumberjack.razorpay.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com",
              "worker-src 'self' blob:",
            ].join('; ')
          }
        ]
      }
    ]
  }
};

export default nextConfig;
