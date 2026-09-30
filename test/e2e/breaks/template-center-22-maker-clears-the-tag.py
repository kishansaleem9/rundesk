# CHOOSING A MAKER THROWS AWAY THE CHOSEN TAG (`ledger-rows/row-1874`).
#
# Each menu works alone; the two together do not, because the second choice
# silently resets the first — the grid still narrows, to the wrong set, and the
# request that reaches the server carries one filter, not two.
#
# Reddens: template-center: "and Tags and Created by on top of those four still leave it, asked of the server together"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-templates-page.tsx'
a = "            onChange={(e) => setCreatedBy(e.target.value)}\n"
b = "            onChange={(e) => { setCreatedBy(e.target.value); setTag('') /* BROKEN: a maker clears the tag */ }}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-22-maker-clears-the-tag: choosing a maker resets the Tags menu')
