# THE AUTOMATIONS PAGE OFFERS EVERYONE EVERYTHING, as it did: the manager is offered New automation, Use and Delete.
# Reddens: admin-only-keys: "the automations page lists the workspace’s rules to the manager and offers them nothing to make or delete — and offers New automation, Use and Delete to the member granted automation.manage"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-automations-page.tsx'
a = "  const mayManage = usePermissions(workspaceId).can('automation.manage') === true\n"
b = "  const mayManage: boolean = usePermissions(workspaceId).can('automation.manage') === true || true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('aok-5-page-offers-everyone: the page offers everyone')
