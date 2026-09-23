# ORDERED BY LAST UPDATE, as it was: a limit cuts whatever was touched longest ago, due or not.
# Reddens: home-my-work: "soonest due first, undated last — so a limit cuts the least urgent"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      .orderBy(sql`${tasks.dueDate} asc nulls last`, desc(tasks.updatedAt))\n'
b = '      .orderBy(desc(tasks.updatedAt))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-3-by-last-update: applied")
