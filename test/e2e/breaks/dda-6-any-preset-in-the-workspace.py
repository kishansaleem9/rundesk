# ANY PRESET IN THE WORKSPACE IS MADE THE DEFAULT, AS IT WAS: the granted member publishes the manager's private dashboard.
# Reddens: default-dashboard-access: "even granted the key, a member cannot make a colleague’s unshared dashboard the workspace default — it is not found for them (404), and the default does not move"
import io
p = '/home/user/rundesk/apps/api/src/modules/dashboards/dashboards.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (!preset || !(await this.mayReadPreset(preset, workspaceId, actor.id))) {\n'
b = '    if (!preset || !((await this.mayReadPreset(preset, workspaceId, actor.id)) || true)) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dda-6-any-preset-in-the-workspace: the setter may promote any preset in the workspace')
