# A PROJECT SHARED WITH A GUEST GRANTS NOTHING: its tasks are refused them.
# Reddens: guest-read-scope: "a guest reads a task under a project shared with them, and is refused one under the project beside it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/guest-reach.ts'
a = "    inArray(projects.id, sharedIds(db, actorId, 'project')),\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-13-project-shares-ignored: a project shared with a guest grants nothing')
