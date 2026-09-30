# THE HEADING DRAWS A FIELD THE ANSWER DOES NOT HAVE. (`found-30-sep/public-doc-page-reads-the-envelope`)
#
# The doc answers `title`; a heading that reads `name` draws nothing.
#
# Reddens: public-doc-page: "anybody holding the link reads the doc’s title, signed in nowhere, at /d/<slug>"
import io
p = '/home/user/rundesk/apps/web/src/routes/d.$slug.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              {doc.title}\n            </h1>'
b = '              {(doc as unknown as { name?: string }).name}\n            </h1>'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdp-2-the-heading-draws-a-name-it-lacks: the heading reads a missing name')
