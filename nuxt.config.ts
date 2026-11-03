import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false, // SPA: all crypto is client-side
  spaLoadingTemplate: true, // splash from app/spa-loading-template.html
  css: ['~/assets/css/main.css'],
  app: {
    head: { viewport: 'width=device-width, initial-scale=1, viewport-fit=cover', meta: [{ name: 'theme-color', content: '#dbeafe' }] }
  },
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: ['.trycloudflare.com'] }
  },
  nitro: {
    experimental: { openAPI: false },
    compressPublicAssets: true,
    routeRules: {
      '/**': {
        headers: {
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Resource-Policy': 'same-origin'
        }
      },
      '/api/**': { headers: { 'Cache-Control': 'no-store' } }
    }
  },
  $production: {
    nitro: {
      routeRules: {
        '/**': {
          headers: {
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src blob:; worker-src 'self' blob:; object-src 'none'; connect-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
            'Strict-Transport-Security': 'max-age=63072000; includeSubDomains'
          }
        }
      }
    }
  }
})
