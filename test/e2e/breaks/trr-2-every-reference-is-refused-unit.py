# EVERY TASK ANOTHER TASK POINTS AT IS REFUSED, whoever may open it: the refusal test passes a rule that refuses
# everybody, so the test also asks that one its caller may open passes.
# Reddens: unit: tasks-refused-reads.test.ts "and one the caller may open passes, so the refusal is about the task"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    await this.assertTaskReadAccess(otherTaskId, actorId).catch((err) => {\n      throw err instanceof NotFoundException ? new NotFoundException(notFound) : err\n    })\n'
b = '    throw new NotFoundException(notFound)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-2-every-reference-is-refused-unit: every reference is refused')
