# ARCHIVED AND BINNED TASKS ARE LISTED: both filters go.
# (Re-aimed 24 September. It first dropped only the `deletedAt` condition and
# reddened nothing, 7/7: `binTask` archives as well, so the archive filter
# still held, and the defect it claimed to restore had never existed.)
# Reddens: home-my-work: "nothing finished, whatever its closed status is called, and nothing in the Trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          eq(tasks.isArchived, false),\n          isNull(tasks.deletedAt),\n          or(isNull(tasks.statusCategory)'
b = '          or(isNull(tasks.statusCategory)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-2-the-bin-is-listed: applied")
