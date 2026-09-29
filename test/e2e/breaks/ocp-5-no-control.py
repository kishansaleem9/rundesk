# THE WORKLOAD PAGE OFFERS NO CAPACITY CONTROL AGAIN.
# Reddens: own-capacity: "the plain member’s Workload offers a capacity control on their own row and on nobody else’s, and setting 32 hours through it saves them"
#   or "the manager’s Workload offers the control on their own row and on a plain member’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-workload-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                  <CapacityBadge workspaceId={workspaceId} person={p} editable={setsCapacityOf(p.userId)} />\n'
b = '                  <CapacityBadge workspaceId={workspaceId} person={p} editable={Boolean(0) && setsCapacityOf(p.userId)} />\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ocp-5-no-control: no control is offered')
