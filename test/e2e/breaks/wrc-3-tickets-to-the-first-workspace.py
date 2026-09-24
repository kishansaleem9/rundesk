# A SUPPORT TICKET GOES TO THE FIRST WORKSPACE, whichever one is open, as it did.
# Reddens: workspace-role-controls: "a support ticket filed from the second workspace is filed in the second workspace, not the member’s first"
import io
p = '/home/user/rundesk/apps/web/src/components/support-widget.tsx'
a = '  const workspaceId = routeWorkspaceId ?? authWorkspaces[0]?.id ?? null\n'
b = '  const workspaceId = authWorkspaces[0]?.id ?? routeWorkspaceId ?? null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wrc-3-tickets-to-the-first-workspace: applied")
