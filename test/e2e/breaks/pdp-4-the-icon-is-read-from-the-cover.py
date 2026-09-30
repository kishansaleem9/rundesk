# THE ICON IS READ FROM THE COVER'S FIELD, which is empty, so no icon is drawn. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# Reddens: public-doc-page: "the doc’s icon is drawn beside its title"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {doc.icon}\n            </span>'
b = '              {doc.coverImageUrl}\n            </span>'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-4-the-icon-is-read-from-the-cover: the icon draws the cover field')
