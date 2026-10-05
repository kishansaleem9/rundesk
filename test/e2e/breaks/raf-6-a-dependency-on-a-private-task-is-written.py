# A DEPENDENCY ASKS ONLY THAT THE OTHER TASK IS IN THE WORKSPACE, NOT WHETHER ITS CALLER MAY OPEN IT: the
# member's task is blocked by a private task they may not open, and the dependency is written.
# Reddens: refused-as-forbidden: "a dependency on a task the member may not open is refused 403 “This task is private”, and none is written — one on an id naming nothing is 404"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!other || other.workspaceId !== workspaceId) throw new NotFoundException(notFound)\n    await this.assertTaskReadAccess(otherTaskId, actorId)\n  }\n'
b = '    if (!other || other.workspaceId !== workspaceId) throw new NotFoundException(notFound)\n  }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-6-a-dependency-on-a-private-task-is-written: a reference asks no read rule')
