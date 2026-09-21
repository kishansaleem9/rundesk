# Removing a person drops the FIRST entry rather than the one asked for. Looks
# correct whenever the first is the one being removed, which is what a check
# that only removed one person would have tested.
# Reddens: team-schedules: "removing one person takes their column away and leaves the others where they were"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '      ? teamUserIds.filter((id) => id !== userId)\n'
b = '      ? teamUserIds.slice(1)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: removing anybody now removes the first person.')
