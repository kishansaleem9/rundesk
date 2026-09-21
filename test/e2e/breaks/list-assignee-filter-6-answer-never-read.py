# THE MIRROR DEFECT, exactly. The server answers correctly, the request goes
# out with the right flags, the query caches it — and `filterTasks` is never
# told about it, so the grid never changes. Every API check still passes.
# Reddens: the three one-at-a-time grid checks and "all three together".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      showClosed,\n      assignedViaIds,\n    )'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '      showClosed,\n    )'))
print('[break 6] The assigned-via answer is fetched and thrown away.')
