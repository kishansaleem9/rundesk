# THE BRANDING WAITS OUT ANY WAIT, however long. (`found-30-sep/public-pages-read-429-as-gone`)
#
# Reddens: unit: branding-retry.test.ts "a wait longer than a minute is not waited out"
import io
p = '/home/user/rundesk/apps/web/src/lib/branding-retry.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (seconds === null || attempt > 0 || seconds > 60) return null\n'
b = '  if (seconds === null || attempt > 0) return null\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-10-any-wait-is-waited-out-unit: any wait is waited out')
