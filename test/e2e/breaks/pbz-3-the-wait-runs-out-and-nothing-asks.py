# THE WAIT RUNS OUT AND NOTHING ASKS AGAIN: the countdown never calls its retry. (`found-30-sep/public-pages-read-429-as-gone`)
#
# The page says it will try again, and then does not.
#
# Reddens: public-pages-busy: "and once the wait is over it asks again by itself, and the doc is drawn"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-retry-after.ts'
s = io.open(p, encoding='utf-8').read()
a = '      retryRef.current()\n      return\n'
b = '      return\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-3-the-wait-runs-out-and-nothing-asks: the countdown never retries')
