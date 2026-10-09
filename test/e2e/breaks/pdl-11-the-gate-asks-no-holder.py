# A LIST WHOSE PROJECT IS IN THE TRASH TAKES A TASK: the create gate asks nothing of what holds the list. (`found-6-oct/task-fallback-files-into-a-deleted-project`)
# Re-claimed 9 October: /task with no list chosen goes to the Personal List, past every list of the hierarchy (`found-24-sep/planner-default-list-read-by-nothing`).
# Reddens: planner-default-list: "with the oldest list’s project deleted and no list chosen, /task lands in the Personal List as ever; a task made or moved straight into the deleted project’s list is refused — 409, saying its project is in the trash and what to do — and none lands there; the picker no longer offers it, offers the other project’s list, and offers no Personal List as a list of the hierarchy"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (held && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, held.deletedById, actorId), held.where)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdl-11-the-gate-asks-no-holder: the create gate asks nothing of what holds the list')
