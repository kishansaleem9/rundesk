# THE SIDEBAR PAGE LISTS THE SHOWN SECTIONS IN THE FRAME'S ORDER, NOT THE RAIL'S: the page and the rail disagree after a reorder.
# Reddens: rail-reorder: "and the Sidebar page lists its rows in that order"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '  const railShown = railSectionsShown(settings?.railSections)\n'
b = '  const railShown = RAIL_SECTIONS.filter((key) => railSectionsShown(settings?.railSections).includes(key))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rro-4-page-lists-the-frames-order: the page lists its rows in RAIL_SECTIONS order')
