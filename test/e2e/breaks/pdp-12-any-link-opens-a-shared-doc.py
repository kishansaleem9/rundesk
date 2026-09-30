# THE PUBLIC LOOKUP DOES NOT ASK FOR THE SLUG: any link opens a shared doc. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# Reddens: public-doc-page: "a link that was never made says “Doc not found”, while the doc’s own link is live"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .where(and(eq(docs.publicShareId, slug), isNotNull(docs.publicShareId)))\n'
b = '      .where(isNotNull(docs.publicShareId))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-12-any-link-opens-a-shared-doc: any link opens a shared doc')
