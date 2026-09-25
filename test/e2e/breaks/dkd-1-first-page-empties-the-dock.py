# THE ROW A PERSON'S FIRST PAGE WRITES HOLDS AN EMPTY DOCK AGAIN: nobody chose it,
# and every default tool is gone.
# Reddens: dock-defaults: "a dock nobody arranged keeps its default tools after moving between pages — the row the pages wrote records no choice"
#   or "the first tick adds to the default tools, not to nothing — the dock keeps them and gains Goals"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '            patch.pinnedLinks === undefined || patch.pinnedLinks === null\n              ? null\n'
b = '            patch.pinnedLinks === undefined || patch.pinnedLinks === null\n              ? []\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("dkd-1-first-page-empties-the-dock: the first page empties the dock")
