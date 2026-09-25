# THE PERSONAL GRANT'S STATE IS NOT MARKED PERSONAL: its callback writes the workspace's connection, and its failure the workspace's card.
# Reddens: personal-calendar-connect: "a member is answered with Google’s consent address, for their own calendar — its signed state names them, this workspace, and a personal grant"
#   or "a personal grant that fails lands on the planner’s Accounts page saying why, and writes nothing onto the workspace’s calendar card — the admin’s lands on the App Center, on its card"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const state = this.signState({ provider, workspaceId, userId, ts: Date.now(), ...(opts.personal ? { personal: true as const } : {}) })\n'
b = "    const state = this.signState({ provider, workspaceId, userId, ts: Date.now(), ...(opts.personal && workspaceId === '' ? { personal: true as const } : {}) })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pcc-2-state-not-marked-personal: the state is never personal')
