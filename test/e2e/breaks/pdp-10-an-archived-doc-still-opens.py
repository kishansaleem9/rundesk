# THE PUBLIC LOOKUP IGNORES ARCHIVING: an archived doc's link still opens it. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# Reddens: public-doc-page: "archiving the doc closes its link: the page says “Doc not found”"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!row || row.isArchived) throw new NotFoundException('Doc not found')\n"
b = "    if (!row) throw new NotFoundException('Doc not found')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-10-an-archived-doc-still-opens: an archived doc still opens')
