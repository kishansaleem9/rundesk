# A 429 IS NOT READ AS ONE: the reader of a refusal answers "nothing to wait for". (`found-30-sep/public-pages-read-429-as-gone`)
#
# The clip page and the portal go back to calling a refusal a link that is gone.
#
# Reddens: public-pages-busy: "a clip’s link refused for too many requests says so, and when it will try again, not that the clip is not available"
import io
p = '/home/user/rundesk/apps/web/src/lib/api.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (!(error instanceof ApiError) || error.status !== 429) return null\n'
b = '  return null\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-1-a-429-is-not-read-as-one: a 429 reads as no refusal')
