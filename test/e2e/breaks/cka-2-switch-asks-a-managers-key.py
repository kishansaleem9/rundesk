# A WORKSPACE CLICKAPP SWITCH ASKS A MANAGER'S KEY: the manager turns Forms off, and the member granted workspace.clickapps.manage cannot.
# Reddens: clickapp-flags-access: "a member granted workspace.clickapps.manage turns a ClickApp off for the workspace, and so does the admin — the manager and a plain member are refused (403) and write nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '!(await this.customRoles.hasPermission(workspaceId, actor.id, CLICKAPPS_KEY))'
b = "!(await this.customRoles.hasPermission(workspaceId, actor.id, 'members.invite'))"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-2-switch-asks-a-managers-key: PUT feature-flags/:flag asks members.invite')
