# And for "Collapse empty columns": the preference is live, the lanes ignore it.
# Reddens: list-customize: "switching it on folds the empty lane"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                    collapsedColumns.has(s.key) !==\n                    (collapseEmptyColumns && (tasksByStatus[s.key] ?? []).length === 0)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                    collapsedColumns.has(s.key)'))
print('[break 3] Collapse empty columns changes nothing on the board.')
