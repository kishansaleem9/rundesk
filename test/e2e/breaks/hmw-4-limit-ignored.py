# THE LIMIT IS IGNORED: Home cannot ask for one more than it shows, so it cannot tell a cut list.
# Reddens: home-my-work: "soonest due first, undated last — so a limit cuts the least urgent"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      .limit(Math.min(Math.max(Math.floor(limit) || MEMBER_TASKS_DEFAULT_LIMIT, 1), MEMBER_TASKS_MAX_LIMIT))\n'
b = '      .limit(Math.min(Math.max(Math.floor(limit) * 0 || MEMBER_TASKS_DEFAULT_LIMIT, 1), MEMBER_TASKS_MAX_LIMIT))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hmw-4-limit-ignored: applied")
