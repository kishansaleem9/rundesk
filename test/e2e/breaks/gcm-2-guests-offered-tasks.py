# A TASK IS OFFERED TO A GUEST AGAIN, though the API always answers
# "Guests cannot create tasks".
# Reddens: guest-create-menu: "a guest who may add to no space is offered a reminder and nothing else — a member is offered a task, a doc, a whiteboard and a list"
#   or "given a space with Full edit, a guest is offered a list — in the Create menu and on that space’s menu, not on the space they pass through — and still no task"
import io
p = '/home/user/rundesk/apps/web/src/lib/create-types.ts'
a = "blurbKey: 'createMenu.blurbTask', inSpace: true, scopedToSpace: true, isContainer: false, guests: 'no' },\n"
b = "blurbKey: 'createMenu.blurbTask', inSpace: true, scopedToSpace: true, isContainer: false, guests: 'yes' },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcm-2-guests-offered-tasks: the task row says yes to guests')
