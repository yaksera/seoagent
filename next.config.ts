import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  serverExternalPackages: ['@electric-sql/pglite'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
