# THE ASK FOR A CLICKAPP LEADS TO THE PLATFORM CONSOLE, AS IT DID: a workspace admin who follows it is sent away.
# Reddens: clickapp-flags-access: "a member’s ask for a ClickApp reaches the member granted workspace.clickapps.manage and the admin, not the manager — and leads to this workspace’s Features tab"
import io
p = '/home/user/rundesk/apps/api/src/modules/feature-flags/feature-flags.service.ts'
s = io.open(p, encoding='utf-8').read()
a = 'url: `/app/${workspaceId}/settings?tab=features`'
b = 'url: `/app/admin/features`'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cka-5-ask-leads-to-the-console: the ask links to /app/admin/features')
