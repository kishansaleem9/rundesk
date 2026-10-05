# THE BULK BAR READS NOTHING OF THE TASKS THE SERVER DID NOT CHANGE, and clears as if every one had.
#
# Reddens: task-values: "the list’s bulk bar says how many of the selected tasks the server did not change, and why, and the rest are changed (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (res?.failedCount) {\n',
     '      if (false && res?.failedCount) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-35-the-bulk-bar-says-nothing-of-what-failed: the bulk bar says nothing of what failed')
