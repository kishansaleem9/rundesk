# EVERY FAILURE SAYS THE LINK WAS REVOKED, as the page did before. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# A server that failed tells the visitor the doc is gone.
#
# Reddens: public-doc-page: "a failure that is not a 404 says the doc could not be loaded, not that its link was turned off"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    const gone = docQuery.error instanceof PublicDocError && docQuery.error.status === 404\n'
b = '    const gone = docQuery.isError\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-7-a-failure-says-the-link-is-gone: every failure says not found')
