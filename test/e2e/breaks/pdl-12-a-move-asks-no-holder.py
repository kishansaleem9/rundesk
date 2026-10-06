# A TASK MOVES INTO A LIST WHOSE PROJECT IS IN THE TRASH: the move asks nothing of what holds the list. (`found-6-oct/task-fallback-files-into-a-deleted-project`)
# Reddens: planner-default-list: "with the oldest list’s project deleted and no list chosen, /task passes that list over for one it may add to; a task made or moved straight into it is refused — 409, saying its project is in the trash and what to do — and none lands there; the picker no longer offers it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const held = nearestHolderInTrash(target)\n    if (held) {\n'
b = "    const held = nearestHolderInTrash(target)\n    if (held && actorId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdl-12-a-move-asks-no-holder: a move asks nothing of what holds the list')
