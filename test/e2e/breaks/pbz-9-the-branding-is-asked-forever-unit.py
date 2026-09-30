# THE BRANDING IS ASKED AGAIN AFTER EVERY REFUSAL, not once. (`found-30-sep/public-pages-read-429-as-gone`)
#
# Reddens: unit: branding-retry.test.ts "the branding is not asked a second time"
import io
p = '/home/user/rundesk/apps/web/src/lib/branding-retry.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (seconds === null || attempt > 0 || seconds > 60) return null\n'
b = '  if (seconds === null || seconds > 60) return null\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-9-the-branding-is-asked-forever-unit: the branding is asked forever')
