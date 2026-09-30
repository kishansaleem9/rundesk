# TURNING THE LINK OFF CLEARS ITS DATE AND KEEPS THE SLUG. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# The link turned off still opens the doc.
#
# Reddens: public-doc-page: "a link turned off says “Doc not found” and draws nothing of the doc"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      .set({ publicShareId: null, publicShareEnabledAt: null, updatedAt: new Date() })\n'
b = '      .set({ publicShareEnabledAt: null, updatedAt: new Date() })\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-9-turning-a-link-off-keeps-it: a link turned off still opens')
