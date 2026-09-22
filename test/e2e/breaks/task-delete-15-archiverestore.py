# Check 15 — an archived task still restores through its own door. Invert the
# early return so the archive restore is a no-op on exactly the tasks it is for.
#
# Reddens: task-delete: "archiving never put the task near the bin: it restores intact through its own door"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!before.isArchived) return before"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    if (before.isArchived) return before"))
print('BROKE check 15: POST /tasks/:id/restore no longer un-archives an archived task')
