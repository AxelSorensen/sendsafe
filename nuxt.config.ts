import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false, // SPA: all crypto is client-side
  spaLoadingTemplate: true, // splash from app/spa-loading-template.html
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      // Apply the saved theme before the first paint so there is no white flash in dark mode.
      script: [{ innerHTML: "try{var t=localStorage.getItem('sendsafe-theme')||'system';if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}", tagPosition: 'head' }],
      title: 'SendSafe',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      meta: [
        { name: 'theme-color', content: '#dbeafe' },
        { name: 'description', content: 'SendSafe: send and receive sensitive files safely. Files are end-to-end encrypted in your browser and only the recipient can open them.' },
        { name: 'application-name', content: 'SendSafe' },
        { name: 'apple-mobile-web-app-title', content: 'SendSafe' },
        { name: 'robots', content: 'noindex, nofollow, noarchive' },
        { name: 'referrer', content: 'no-referrer' },
        { name: 'color-scheme', content: 'light' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'SendSafe' },
        { property: 'og:title', content: 'SendSafe: send files safely' },
        { property: 'og:description', content: 'End-to-end encrypted file transfer. Only the recipient can open what you send.' },
        { property: 'og:image', content: '/og.png' },
        { name: 'twitter:card', content: 'summary' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ]
    }
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
