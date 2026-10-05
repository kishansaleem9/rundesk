# UNDER THE SWITCH AN EXISTING PORTAL CANNOT EVEN BE SWITCHED OFF.
# Reddens: hook-portal-access: "with public sharing blocked no new portal is made, by a member or the admin — and an existing one can still be switched off"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.service.ts'
a = '    const portal = await this.getPortalOr404(portalId)\n    await this.assertProjectManageAccess(portal.projectId, userId)\n\n    const patch: Partial<typeof clientPortals.$inferInsert> = {}\n'
b = "    const portal = await this.getPortalOr404(portalId)\n    await this.assertProjectManageAccess(portal.projectId, userId)\n\n    if (portalId) throw new ForbiddenException('Public sharing is disabled for this workspace')\n    const patch: Partial<typeof clientPortals.$inferInsert> = {}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-11-switch-freezes-portals: applied")
