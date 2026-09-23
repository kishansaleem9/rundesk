# THE PRIVATE PROJECT AS A DESTINATION. The space is editable, the project inside
# it is private, and a task is moved into a place its mover cannot see.
# Reddens: task-boundaries: "and so is a list in a private project the caller cannot see, in a space they may otherwise edit"
import io
p = "/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
a = "    if (!canSee) throw new ForbiddenException('You do not have access to that list')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-11-move-skips-visibility: applied")
