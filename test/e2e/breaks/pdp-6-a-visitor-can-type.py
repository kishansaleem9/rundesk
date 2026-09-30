# THE PUBLIC EDITOR TAKES TYPING. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# Nothing is saved, since the visitor has no session, but the page lets them
# change what they read and tick what was ticked.
#
# Reddens: public-doc-page: "the page is read-only: typing changes nothing and the ticked to-do stays ticked"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      editable: false,\n'
b = '      editable: true,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-6-a-visitor-can-type: the public editor is editable')
