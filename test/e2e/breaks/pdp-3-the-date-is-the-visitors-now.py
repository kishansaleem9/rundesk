# THE PAGE SAYS "LAST UPDATED" AND DRAWS THE VISITOR'S OWN CLOCK. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# A date that is always now reads as fresh and says nothing of the doc.
#
# Reddens: public-doc-page: "it says when the doc last changed, the time the server holds, in the visitor’s own format"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                {new Date(doc.updatedAt).toLocaleString()}\n'
b = '                {new Date().toLocaleString()}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-3-the-date-is-the-visitors-now: last updated is always now')
