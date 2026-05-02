import type { NextConfig } from "next";

// CSP currently runs in report-only mode. Violations POST to /api/csp-report.
// Once Vercel logs are clean for a few days, flip the header key from
// `Content-Security-Policy-Report-Only` to `Content-Security-Policy` to enforce.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.catawiki.com https://*.catawiki.nl https://lh3.googleusercontent.com https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
  "report-to csp-endpoint",
].join("; ");

const securityHeaders = [
  { key: "Reporting-Endpoints", value: 'csp-endpoint="/api/csp-report"' },
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.catawiki.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
