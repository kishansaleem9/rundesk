# A WORKSPACE CLICKAPP SWITCH ASKS THE MEMBERSHIP ROW FOR workspace_admin, AS IT DID: no custom role can grant it.
# Reddens: clickapp-flags-access: "a member granted workspace.clickapps.manage turns a ClickApp off for the workspace, and so does the admin — the manager and a plain member are refused (403) and write nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '!(await this.customRoles.hasPermission(workspaceId, actor.id, CLICKAPPS_KEY))'
b = "(await this.db.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id))).limit(1))[0]?.role !== 'workspace_admin'"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-3-switch-asks-the-admin-role: PUT feature-flags/:flag asks the workspace_admin role')
