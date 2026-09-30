# `ram-7`'s edit, claimed by the unit test beside the service.
# Reddens: unit: tasks-refused-reads.test.ts "is refused in the words of one that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    await this.assertTaskReadAccess(otherTaskId, actorId).catch((err) => {\n      throw err instanceof NotFoundException ? new NotFoundException(notFound) : err\n    })\n'
b = '    await this.assertTaskReadAccess(otherTaskId, actorId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-1-a-dependency-says-it-is-there-unit: a refused reference keeps the read rule’s words')
