# The `v` view-cycler goes back to holding its own copy of the view keys, one
# key short — the shipped bug. Team View stays drawn in the tab strip and stays
# clickable; only the keyboard walks past it, which is why nothing looked wrong.
#
# Reddens: team-view:
#   "pressing `v` reaches every view the list offers, Team included"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
a = """        const order: Array<typeof activeView> = (ALL_VIEWS as readonly string[] as Array<typeof activeView>)
          .filter((v) => enabledViewsRef.current.includes(v))"""
b = """        const order: Array<typeof activeView> = (
          ['list', 'board', 'table', 'calendar', 'gantt'] as Array<typeof activeView>
        ).filter((v) => enabledViewsRef.current.includes(v))"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('list route: the v cycler keeps its own five keys again, without team.')
