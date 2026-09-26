# THE HOURS ARE SUMMED FROM EVERY WORKSPACE, AS THEY WERE: another workspace’s five hours are counted here.
# Reddens: time-page-reach: "this workspace’s team week and monthly rollup count the near member’s two hours here — not the five they logged in another workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      where: and(eq(spaces.workspaceId, workspaceId), scope, readable),\n'
b = '      where: and(scope, readable),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tpr-2-hours-from-every-workspace: no workspace condition')
