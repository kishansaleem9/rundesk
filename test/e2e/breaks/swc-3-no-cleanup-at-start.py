# WHAT AN OLDER WORKER STORED IS NEVER DELETED AT START-UP.
# Reddens: sw-api-cache: "an API cache left from before is gone once the app starts again"
import io
p = '/home/user/rundesk/apps/web/src/main.tsx'
a = 'void dropApiCache()\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("swc-3-no-cleanup-at-start: applied")
