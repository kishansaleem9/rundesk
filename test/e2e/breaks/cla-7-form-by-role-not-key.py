# THE PROJECT PAGE OFFERS "+ NEW CLIENT NAME" BY ROLE, NOT BY THE KEY: the member granted client.manage is told it is not theirs.
# Reddens: client-access: "the project page’s Client section offers the “+ New client name” form to a member granted client.manage and to the manager"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const { role } = useWorkspaceRole(workspaceId)\n  const readsClients = role !== 'guest'\n  const mayAddClient = usePermissions(workspaceId).can('client.manage')\n"
b = "  const { role, isManagerOrAbove } = useWorkspaceRole(workspaceId)\n  const readsClients = role !== 'guest'\n  const mayAddClient: boolean | null = usePermissions(workspaceId).can('client.manage') === null ? null : isManagerOrAbove\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cla-7-form-by-role-not-key: the add form follows the base role')
