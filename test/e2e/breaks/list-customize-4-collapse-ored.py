# OR instead of XOR. The lanes fold correctly and the chevron on an
# auto-collapsed lane becomes a control that moves and changes nothing —
# which is the dead control this audit keeps finding, in its smallest form.
# Reddens ONLY: "the lane's own chevron still opens it".
#
# Reddens: list-customize: "and leaves the lane that has cards alone"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                    collapsedColumns.has(s.key) !==\n                    (collapseEmptyColumns && (tasksByStatus[s.key] ?? []).length === 0)'
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '                    collapsedColumns.has(s.key) ||\n                    (collapseEmptyColumns && (tasksByStatus[s.key] ?? []).length === 0)'))
print('[break 4] The chevron on an auto-collapsed lane is now dead.')
