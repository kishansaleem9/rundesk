# THE TRASH IS LISTED: a binned task is not archived, so it stays on Home.
# Reddens: home-my-work: "nothing finished, whatever its closed status is called, and nothing in the Trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          isNull(tasks.deletedAt),\n          or(isNull(tasks.statusCategory)'
b = '          or(isNull(tasks.statusCategory)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-2-the-bin-is-listed: applied")
