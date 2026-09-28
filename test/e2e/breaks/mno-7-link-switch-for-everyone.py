# THE DOCS PANEL DRAWS THE LINK SWITCH FOR EVERYONE WHO CAN OPEN THE DOC.
# Reddens: menu-offers: "the docs panel offers the public-link switch on a doc shared at Edit, and not on one shared at View"
import io
p = '/home/user/rundesk/apps/web/src/components/docs-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      {mayToggle !== false && (\n'
b = '      {(mayToggle !== false || Boolean(1)) && (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mno-7-link-switch-for-everyone: done')
