# A GOAL COMES IN OWNED BY NOBODY.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "the Workspace’s Goal comes in with its Targets: Ana owns it, 70% along as its Targets are, due when it was; four deals of ten, and the site launched"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("          ownerId: this.whom(g.owner),\n          title: g.name.trim().slice(0, 500) || 'Goal',\n",
     "          ownerId: null,\n          title: g.name.trim().slice(0, 500) || 'Goal',\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-28-goal-owner-unmapped: A GOAL COMES IN OWNED BY NOBODY.')
