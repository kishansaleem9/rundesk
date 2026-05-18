import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, path.resolve(__dirname, '../../'), ''),
    ...loadEnv(mode, __dirname, ''),
  }
  const apiProxyTarget =
    (env.VITE_DEV_API_ORIGIN?.replace(/\/$/, '') || 'http://localhost:3001')

  return {
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rundesk',
        short_name: 'Rundesk',
        description: 'AI-first internal project management',
        theme_color: '#354fb0',
        background_color: '#0c215d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Don't precache the JS bundle on every release — it's too big and
        // breaks updates. Use stale-while-revalidate instead.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // App shell — HTML
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rundesk-html',
              networkTimeoutSeconds: 3,
            },
          },
          {
            // API GETs — short-lived stale-while-revalidate so offline reads
            // still work for recently viewed data.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/v1') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rundesk-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: {
        // Disable in dev to avoid SW caching interfering with HMR
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Prevent duplicate React copies across manual chunks (breaks hooks / useState).
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/packages/ui/')) return 'app-ui'
          if (!id.includes('node_modules')) return

          // React core must stay in one chunk; hook-based libs must not pull a second React.
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react-core'
          }

          if (id.includes('date-fns') || id.includes('dayjs')) return 'vendor-date'
          if (id.includes('clsx') || id.includes('tailwind-merge')) return 'vendor-utils'
          if (id.includes('zod')) return 'vendor-zod'
          if (id.includes('socket.io-client')) return 'vendor-realtime'
          return 'vendor'
        },
      },
    },
  },
}
})
