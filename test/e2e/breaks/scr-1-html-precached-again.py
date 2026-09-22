# `index.html` goes back into the precache glob.
#
# The offline story is what makes this plausible, and it is a real one:
# precaching the shell is how a PWA opens without a network at all, and the
# `globPatterns` line sitting one character away from including `html` looks
# like an oversight. The comment above it explains at length why it is not, and
# the comment stays — the code and the paragraph above it disagree and the
# paragraph is right.
#
# Precaching a URL also registers a precache ROUTE for it, and workbox resolves
# a request for "/" through `directoryIndex`, which defaults to `index.html`.
# So the bare origin is answered from the worker's own copy while a deep link
# goes to the network: one shell, two ages, depending how you arrived. That is
# what pinned a real browser to a build from before three shipped features on
# 21 August, and it is worse than precaching nothing, because it only reproduces
# for people who typed the domain.
#
# `navigateFallback` stays `undefined`, which is the point — dropping it was
# not enough on its own, and a patch that only re-added it would prove the
# weaker of the two facts.
#
# Predicted one check. The worker still carries no `NavigationRoute`, and the
# hashed chunks are still excluded by `globIgnores`, so the two checks either
# side of it stay green — which is what makes this precise rather than blunt.
#
# Reddens: stale-chunk-recovery: "index.html is not precached, so HTML always comes from the network"
import io
p = '/home/user/rundesk/apps/web/vite.config.ts'
a = "        globPatterns: ['**/*.{css,svg,png,ico,woff2}'],\n"
b = "        globPatterns: ['**/*.{html,css,svg,png,ico,woff2}'],\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('vite.config.ts: index.html is precached by the service worker again.')
