# ANY MEMBER JOINS ANY LIST'S OR TASK'S ROOM, as it was: membership was the whole rule.
# Reddens: workspace-read-access: "a member cannot join the realtime room of a list or a task they may not read, and hears nothing from it"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    if (kind === 'list' || kind === 'task') return this.canReadListOrTask(kind, id, userId, membership.role as string)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-20-rooms-by-membership: applied")
