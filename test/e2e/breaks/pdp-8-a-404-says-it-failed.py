# A 404 IS READ AS A FAILURE, so a link turned off says "could not be loaded". (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# Reddens: public-doc-page: "a link turned off says “Doc not found” and draws nothing of the doc"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    const gone = docQuery.error instanceof PublicDocError && docQuery.error.status === 404\n'
b = '    const gone = docQuery.error instanceof PublicDocError && docQuery.error.status === 410\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-8-a-404-says-it-failed: a 404 says it failed')
