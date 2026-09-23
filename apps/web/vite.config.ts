import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

/**
 * Identity of this build, baked into the bundle and written to /version.json.
 *
 * A tab open across a deploy goes on running the code it started with — there
 * is no event for "the server has something newer". On 21 Aug 2026 that meant
 * a browser sat on a build from before three shipped features, showing none of
 * them, with nothing broken and nothing to click. The only fix available was
 * clearing site data, which is not something to ask of anyone.
 *
 * So the build says who it is, and the running app can ask the server the same
 * question. Not a version to compare — an identity to differ from.
 */
const BUILD_ID = process.env.VITE_BUILD_ID || Date.now().toString(36)

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, path.resolve(__dirname, '../../'), ''),
    ...loadEnv(mode, __dirname, ''),
  }
  const apiProxyTarget =
    (env.VITE_DEV_API_ORIGIN?.replace(/\/$/, '') || 'http://localhost:3001')

  return {
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    {
      // Emitted rather than kept in public/, so it can never be stale: it is
      // written from the same constant the bundle is compiled with.
      name: 'rundesk-build-stamp',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId: BUILD_ID }),
        })
      },
    },
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The default ('auto') injects a *classic* <script src="/registerSW.js">
      // as the last thing in <head>. A classic script stops the HTML parser
      // dead — and, because scripts also wait on any stylesheet still in
      // flight, it waits for the app CSS first. So <body> could not be parsed,
      // let alone painted, until both had landed: a guaranteed blank screen at
      // the start of every cold load, and the boot skeleton in index.html
      // would never have had the chance to show. `defer` keeps the worker and
      // lets the parser through.
      injectRegister: 'script-defer',
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
        // Precache static media only — deliberately *not* index.html.
        //
        // Dropping navigateFallback above was not enough on its own. Precaching
        // a URL also registers a precache route for it, and workbox resolves a
        // request for "/" through `directoryIndex` (default: 'index.html'). So
        // the bare origin was still answered from the worker's own copy while
        // deep links went to the network — the same shell served two different
        // ages depending on how you arrived, which is worse than either.
        //
        // HTML now always comes from the network. The NetworkFirst rule below
        // still serves the last good copy offline, which is the only thing
        // precaching it bought.
        //
        // This glob used to include `js`, which precached all ~60 route chunks
        // — the opposite of the intent. Because the worker runs skipWaiting +
        // clientsClaim + cleanupOutdatedCaches, a new release would activate
        // under an open tab and delete the chunks it was still importing.
        globPatterns: ['**/*.{css,svg,png,ico,woff2}'],
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
          // NO API RULE, DELIBERATELY. There was one — every `GET /api/v1/*`
          // NetworkFirst into `rundesk-api`, keyed by URL alone, for a day —
          // and it kept each signed-in person's answers past sign-out and served
          // them to whoever signed in next when the network was slow. An
          // authenticated answer is not a static asset. `lib/api-cache.ts`
          // deletes what the old rule stored.
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
