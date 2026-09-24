# THE WORKLOAD-BALANCE ROUTE PASSES NO READER: the service counts for nobody, so for everybody.
# Reddens: ai-read-access: "workload balance counts, for a member, only tasks they may open, and hands out no id of another — the admin’s counts all nine"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = '    return this.ai.workloadBalance(body.workspaceId, { userId: user.id, workspaceId: body.workspaceId }, { id: user.id, role: user.role })\n'
b = '    return this.ai.workloadBalance(body.workspaceId, { userId: user.id, workspaceId: body.workspaceId })\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ars-7-balance-route-passes-nobody: applied")
