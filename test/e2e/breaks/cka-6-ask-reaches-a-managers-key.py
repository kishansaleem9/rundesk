# THE ASK FOR A CLICKAPP REACHES THE HOLDERS OF A MANAGER'S KEY: the manager is told, and the member granted workspace.clickapps.manage is not.
# Reddens: clickapp-flags-access: "a member’s ask for a ClickApp reaches the member granted workspace.clickapps.manage and the admin, not the manager — and leads to this workspace’s Features tab"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = 'const holders = await this.customRoles.holdersOf(workspaceId, CLICKAPPS_KEY)'
b = "const holders = await this.customRoles.holdersOf(workspaceId, 'members.invite')"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-6-ask-reaches-a-managers-key: the ask reaches members.invite holders')
