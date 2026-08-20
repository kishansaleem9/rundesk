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
        // vite-plugin-pwa defaults this to 'index.html', which registers a
        // NavigationRoute *ahead* of everything in runtimeCaching — so every
        // navigation was answered from the worker's own precached shell and
        // the NetworkFirst HTML rule below never once matched. A worker that
        // hasn't updated yet then pins the tab to a shell whose chunks the
        // server has already deleted. Navigations go to the network instead;
        // the NetworkFirst rule still serves the last good HTML when offline.
        navigateFallback: undefined,
        // Precache the shell only. This glob used to include `js`, which
        // precached all ~60 route chunks — the opposite of the intent below.
        // Because the worker runs skipWaiting + clientsClaim +
        // cleanupOutdatedCaches, a new release would activate under an already
        // open tab and delete the very chunks that tab was still importing.
        globPatterns: ['index.html', '**/*.{css,svg,png,ico,woff2}'],
        globIgnores: ['assets/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Build chunks. The filename is the version, so they're immutable
            // and can be served from cache forever — and, crucially, they age
            // out on their own instead of being evicted the moment a new
            // release activates.
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'rundesk-assets',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
