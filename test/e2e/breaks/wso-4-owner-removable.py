# AN ADMIN REMOVES THE OWNER.
# Reddens: workspace-ownership: "an admin can neither remove the owner nor make them anything but an admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '    const kept = ownerProtected(userId, await this.ownerOf(workspaceId), { remove: true })\n    if (kept) throw new BadRequestException(kept)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wso-4-owner-removable: applied")
