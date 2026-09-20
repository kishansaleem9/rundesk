# Check 10 — the archive restore refuses a task that is in the Trash. Remove
# the guard, and un-archiving makes the task live while the Trash still offers
# to destroy it: live and deleted at once.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = """    if (before.deletedAt) {
      throw new ConflictException('This task is in the trash. Restore it from Trash instead.')
    }
"""
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('BROKE check 10: POST /tasks/:id/restore now un-archives a task that is in the Trash')
