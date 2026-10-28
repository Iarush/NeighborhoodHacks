import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// Uses i18n/request.ts for the language, messages and time zone.
const withNextIntl = createNextIntlPlugin()

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Outside sites (like an agenda link) never see our page's full URL or query string.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  // The ingest route reads the source registry, manual agendas and body catalog from disk at run time.
  outputFileTracingIncludes: {
    '/api/cron/ingest': ['./data/sources.yaml', './data/manual/**/*', './data/bodies.yaml', './data/bodies.districts.yaml'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // The notification service worker: always fetch the latest, and let it load only our own scripts.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
