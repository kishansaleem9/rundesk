# THE CATALOG OFFERS workspace.delete AGAIN, AS IT DID: the editor lists a key that nothing asks.
# Reddens: retired-permission-keys: "the catalog offers workspace.delete, which no route asks, no longer — and still offers the keys that gate something (workspace.manage among them)"
#   or "the role editor offers Manage workspace settings and no longer offers Delete workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/permission-catalog.ts'
s = io.open(p, encoding='utf-8').read()
a = "  | 'workspace.billing'\n"
b = "  | 'workspace.billing'\n  | 'workspace.delete'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  { key: 'workspace.billing',    label: 'Manage billing',             description: 'View invoices, change plan, manage payment method', category: 'Workspace' },\n"
b = "  { key: 'workspace.billing',    label: 'Manage billing',             description: 'View invoices, change plan, manage payment method', category: 'Workspace' },\n  { key: 'workspace.delete',     label: 'Delete workspace',           description: 'Permanently delete the workspace and all data', category: 'Workspace' },\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rpk-1-retired-key-offered-again: workspace.delete is in the catalog')
