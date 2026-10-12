# TURNED OFF, THE CLICKAPP KEEPS EVERY PLACEMENT.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "turning the ClickApp off takes every task of the workspace out of the lists it was added to, and turning it on again brings none back (read by SQL)"
#
# Turning it off takes no task out of a list it was added to.
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      if (!enabled && scope === 'workspace' && workspaceId && flagKey === FLAGS.TASKS_IN_MULTIPLE_LISTS) {\n",
     "      if (!enabled && scope === 'workspace' && workspaceId && flagKey === FLAGS.TASKS_IN_MULTIPLE_LISTS && flagKey.length < 0) { // BROKEN\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-9-off-keeps-the-placements: TURNED OFF, THE CLICKAPP KEEPS EVERY PLACEMENT.')
