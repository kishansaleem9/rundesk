# A LIST'S TASKS ARE ALL LISTED TO A GUEST who has one of them shared: the
# task-listing rule forgets the guest, so the task beside theirs is named too.
# Reddens: guest-read-scope: "a guest reads a task shared with them and its subtask, and neither by id nor in its list the task beside it"
#   or "across the workspace, a guest’s task listing and search hold what is shared with them and nothing else — a member’s search finds the open space’s task"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/item-visibility.ts'
a = '    guestTaskFilter(db, actorId),\n  )'
b = '  )'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-4-list-tasks-unfiltered: task listings forget the guest')
