# DRAFT A REPLY ANSWERS A TASK ITS ASKER MAY NOT OPEN AS ONE THAT IS NOT THERE (404 "Task not found"), the words
# of an id naming nothing.
# Reddens: refused-as-forbidden: "Draft a reply refuses a task the member may not open, 403 “You do not have access to this task” — and an id naming nothing is 404"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "      throw new ForbiddenException('You do not have access to this task')\n"
b = "      throw new NotFoundException('Task not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('raf-7-draft-a-reply-says-not-there: the AI task read refuses as not there')
