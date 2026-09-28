# THE WORKSPACE'S CLICKAPP OVERRIDES ASK A MANAGER'S KEY: the manager reads who switched what, and the member granted workspace.clickapps.manage does not.
# Reddens: clickapp-flags-access: "the workspace’s ClickApp overrides are read by the member granted workspace.clickapps.manage and the admin (200) — not by the manager or a plain member (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @RequirePermissions('workspace.clickapps.manage')\n  async listWorkspaceOverrides("
b = "  @RequirePermissions('members.invite')\n  async listWorkspaceOverrides("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-1-overrides-ask-a-managers-key: GET feature-flags/workspace/:id asks members.invite')
