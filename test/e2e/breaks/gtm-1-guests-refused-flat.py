# EVERY GUEST IS REFUSED A TASK BEFORE THEIR SHARES ARE READ, as they were.
# Reddens: guest-task-making: "a guest adds a task to a list shared with them at Full edit — and not at Edit (403), nor to a list not shared with them, none made"
#   or "given a whole space at Full edit, a guest adds a task in it"
#   or "the list page offers the guest Add task and the add rows in the list at Full edit, and neither in the one at Edit"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = "  if (!list) throw new NotFoundException('List not found')\n  await assertCanCreateInSpace(db, {\n"
b = "  if (!list) throw new NotFoundException('List not found')\n  if (list.role === 'guest') throw new NotFoundException('Guests cannot create tasks')\n  await assertCanCreateInSpace(db, {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gtm-1-guests-refused-flat: applied')
