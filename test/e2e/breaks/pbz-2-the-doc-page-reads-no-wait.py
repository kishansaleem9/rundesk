# THE PUBLIC DOC PAGE READS NO WAIT FROM ITS 429, so it calls the refusal a failure. (`found-30-sep/public-pages-read-429-as-gone`)
#
# Reddens: public-pages-busy: "a shared doc refused for too many requests says so, and in how many seconds it will try again, not that its link is gone"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  if (res.status !== 429) return null\n'
b = '  return null\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pbz-2-the-doc-page-reads-no-wait: the doc page reads no wait')
