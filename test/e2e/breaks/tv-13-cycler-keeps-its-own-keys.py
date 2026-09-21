# The `v` view-cycler goes back to holding its own copy of the view keys, one
# key short — the shipped bug. Team View stays drawn in the tab strip and stays
# clickable; only the keyboard walks past it, which is why nothing looked wrong.
#
# RE-ANCHORED 21 September, and by the check that exists for this. The cycler
# used to read the route's own `ALL_VIEWS`; that copy was deleted when the view
# keys were reduced to one list, and this patch's anchor went with it.
# `scripts/check-break-patches.py` reported it within a minute of the refactor —
# which is the whole argument for that script being in CI, because the refactor
# and the disarmed check would otherwise have travelled separately and only the
# refactor would have been reviewed.
#
# Reddens: team-view:
#   "pressing `v` reaches every view the list offers, Team included"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """        const order: Array<SpaceViewKey> = (SPACE_VIEW_KEYS as readonly string[] as Array<SpaceViewKey>)
          .filter((v) => enabledViewsRef.current.includes(v))"""
b = """        const order: Array<SpaceViewKey> = (
          ['list', 'board', 'table', 'calendar', 'gantt'] as Array<SpaceViewKey>
        ).filter((v) => enabledViewsRef.current.includes(v))"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the v cycler keeps its own five keys again, without team.')
