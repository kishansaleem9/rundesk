# A LIST SHARED WITH A GUEST GRANTS NOTHING: it is refused them, tasks and all.
# Reddens: guest-read-scope: "a guest reads the tasks of a list shared with them, is refused the list beside it’s task, and is listed only the shared list"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/guest-reach.ts'
a = "    .where(or(projectReach(db, actorId), inArray(lists.id, sharedIds(db, actorId, 'list'))))"
b = '    .where(or(projectReach(db, actorId)))'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-14-list-shares-ignored: a list shared with a guest grants nothing')
