# A TASK WITH NO PLACE GOES TO THE OLDEST LIST, NOT THE PERSONAL LIST.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "a task made with no list chosen — /task — lands in her Personal List, and Home lists it, the list counting her two open tasks"
#   or "with no list chosen, /task lands in the person’s own Personal List, not the oldest list they can add to"
#
# /task with no list chosen passes the Personal List over for the oldest list the person can add to, as it did.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (personal) return personal.id\n',
     '    if (personal && personal.id === \'\') return personal.id // BROKEN: no Personal List asked\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-2-a-task-with-no-place-goes-to-the-oldest: A TASK WITH NO PLACE GOES TO THE OLDEST LIST, NOT THE PERSONAL LIST.')
