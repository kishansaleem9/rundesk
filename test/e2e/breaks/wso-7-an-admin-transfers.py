# AN ADMIN WHO DOES NOT OWN THE WORKSPACE TRANSFERS IT, to themself.
# Reddens: workspace-ownership: "transferring is refused to an admin who does not own it, to a guest, to somebody not in it, and with the name typed wrong — and the owner stays the owner"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "    if (!(await this.actsAsOwner(ws, actor))) throw new ForbiddenException('Only the workspace’s owner can transfer its ownership')\n"
b = "    if (!(await this.actsAsOwner(ws, actor)) && Boolean(0)) throw new ForbiddenException('Only the workspace’s owner can transfer its ownership')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-7-an-admin-transfers: applied")
