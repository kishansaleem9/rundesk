# The vhost stops sending `Cache-Control: no-cache` for `index.html` and `sw.js`.
#
# The `location` block stays, the `try_files` stays, the file list stays — only
# the header goes. That is why it reads as tidying: the block still exists and
# still looks like it is doing something, and nginx does send validators
# (Last-Modified and ETag) without it, so nothing appears uncached.
#
# Browsers then apply HEURISTIC FRESHNESS to a document with validators and no
# max-age: a fraction of the time since Last-Modified, reused without asking,
# for hours. A returning visitor gets a shell that names chunks a later deploy
# has already removed, every lazy import 404s, and the app dies on a screen it
# rendered from cache. The whole recovery mechanism this suite tests is downstream
# of the shell being fresh; none of it can help a tab that never asks the
# server.
#
# Predicted one check, and it is the only static check in the suite that reads
# the vhost. Nothing in the browser half can see it either — Playwright's
# contexts are fresh, so heuristic freshness never gets a chance to apply, which
# is exactly why this fact is asserted against the config file rather than
# against a page.
#
# Reddens: stale-chunk-recovery: "index.html and sw.js are served no-cache"
import io
p = '/home/user/rundesk/deploy/nginx/rundesk.theaura.agency.conf'
a = """        add_header Cache-Control "no-cache" always;
        try_files $uri /index.html;
"""
b = """        try_files $uri /index.html;
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('nginx conf: the shell and the worker are served without no-cache.')
