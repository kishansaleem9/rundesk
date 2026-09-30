# A DEPENDENCY ON A TASK ITS CALLER MAY NOT OPEN IS REFUSED IN THE READ RULE'S WORDS, NOT THE REFERENCE'S: "Task
# not found" where an id naming nothing is "Related task not found".
# Reddens: refused-as-missing: "a dependency on a task the member may not open is refused as one on an id naming nothing, and none is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    await this.assertTaskReadAccess(otherTaskId, actorId).catch((err) => {\n      throw err instanceof NotFoundException ? new NotFoundException(notFound) : err\n    })\n'
b = '    await this.assertTaskReadAccess(otherTaskId, actorId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-7-a-dependency-says-it-is-there: a refused reference keeps the read rule’s words')
