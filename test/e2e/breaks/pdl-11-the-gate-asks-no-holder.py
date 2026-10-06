# A LIST WHOSE PROJECT IS IN THE TRASH TAKES A TASK: the create gate asks nothing of what holds the list. (`found-6-oct/task-fallback-files-into-a-deleted-project`)
# Reddens: planner-default-list: "with the oldest list’s project deleted and no list chosen, /task passes that list over for one it may add to; a task made or moved straight into it is refused — 409, saying its project is in the trash and what to do — and none lands there; the picker no longer offers it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (held && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, held.deletedById, actorId), held.where)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdl-11-the-gate-asks-no-holder: the create gate asks nothing of what holds the list')
