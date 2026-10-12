# A GUEST ADDS A TASK TO ANOTHER LIST.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "a guest, though the task is shared with them to edit, is told guests do not, and refused (403); a member who may only read a task is refused in the write rule’s words; and nobody adds a task to a list they may not add tasks to (403) — none kept (read by SQL)"
#
# A guest with the task shared to edit adds it to a list.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-lists.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (ctx.role === 'guest') return TASK_LISTS_REFUSALS.guest\n",
     '    // BROKEN: a guest is not refused\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-2-a-guest-adds-it-to-a-list: A GUEST ADDS A TASK TO ANOTHER LIST.')
