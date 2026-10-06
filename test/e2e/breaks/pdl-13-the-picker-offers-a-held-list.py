# THE DEFAULT-LIST PICKER OFFERS A LIST WHOSE PROJECT IS IN THE TRASH. (`found-6-oct/task-fallback-files-into-a-deleted-project`)
# Reddens: planner-default-list: "with the oldest list’s project deleted and no list chosen, /task passes that list over for one it may add to; a task made or moved straight into it is refused — 409, saying its project is in the trash and what to do — and none lands there; the picker no longer offers it"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
s = io.open(p, encoding='utf-8').read()
a = 'eq(lists.isArchived, false), holdersNotInTrash(), visFilter))'
b = 'eq(lists.isArchived, false), visFilter))'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pdl-13-the-picker-offers-a-held-list: the picker offers lists held in the trash')
