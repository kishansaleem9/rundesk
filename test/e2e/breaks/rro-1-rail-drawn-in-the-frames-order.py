# THE RAIL IS DRAWN IN THE FRAME'S ORDER AGAIN, WHATEVER IS STORED: the shown set is honoured and its order is not.
# Reddens: rail-reorder: "after a reload the rail is drawn in the stored order, Backlog first"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '  const railShown = railSectionsShown(settings?.railSections)\n'
b = ("  const railShown = railSectionsShown(settings?.railSections).sort((x, y) =>\n"
     "    ['priorities', 'meetWith', 'assignedToMe', 'todayOverdue', 'backlog'].indexOf(x) -\n"
     "    ['priorities', 'meetWith', 'assignedToMe', 'todayOverdue', 'backlog'].indexOf(y))\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rro-1-rail-drawn-in-the-frames-order: the rail ignores the stored order')
