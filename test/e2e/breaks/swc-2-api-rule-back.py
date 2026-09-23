# THE API RULE AS IT WAS: every authenticated GET kept for a day, keyed by URL alone.
# Reddens: sw-api-cache: "and after reading home and the profile, not one API answer is in any cache"
import io
p = '/home/user/rundesk/apps/web/vite.config.ts'
a = "          // NO API RULE, DELIBERATELY. There was one — every `GET /api/v1/*`\n          // NetworkFirst into `rundesk-api`, keyed by URL alone, for a day —\n          // and it kept each signed-in person's answers past sign-out and served\n          // them to whoever signed in next when the network was slow. An\n          // authenticated answer is not a static asset. `lib/api-cache.ts`\n          // deletes what the old rule stored.\n"
b = "          {\n            urlPattern: ({ url, request }) =>\n              url.pathname.startsWith('/api/v1') && request.method === 'GET',\n            handler: 'NetworkFirst',\n            options: {\n              cacheName: 'rundesk-api',\n              networkTimeoutSeconds: 5,\n              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },\n            },\n          },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("swc-2-api-rule-back: applied")
