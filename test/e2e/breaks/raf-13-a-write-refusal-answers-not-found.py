# A TASK ITS CALLER MAY NOT OPEN IS "NOT FOUND" AGAIN WHEN CHANGED OR MOVED
# (`found-6-oct/task-writes-answer-a-refusal-as-not-found`): its read answers
# 403 with the reason, its change and its move 404, as an id naming nothing does.
# Reddens: refused-as-forbidden: "a change or a move of a task its caller may not open is refused 403 in the read’s words — a private task, list or space, a guest’s, a stranger’s — and nothing changes (SQL); a change of an id naming nothing is 404"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = "  if ('refused' in read) throw new ForbiddenException(read.refused)\n"
b = "  if ('refused' in read) throw new NotFoundException('Task not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-13-a-write-refusal-answers-not-found: a refused change is 404 again')
