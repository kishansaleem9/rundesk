# "Collapse empty columns" collapses EVERY column.
# Reddens: "and leaves the lane that has cards alone".
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                    (collapseEmptyColumns && (tasksByStatus[s.key] ?? []).length === 0)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                    collapseEmptyColumns'))
print('[break 5] Every lane folds, not just the empty ones.')
