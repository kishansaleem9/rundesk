# THE SAMPLE-DATA CARD OFFERS LOAD DEMO DATA TO EVERYBODY, AS IT DID.
# Reddens: data-transfer-keys: "an empty workspace’s dashboard offers Load demo data to the member granted workspace.import, and not to the manager"
import io
p = '/home/user/rundesk/apps/web/src/components/demo-data-empty-state.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayImport = usePermissions(workspaceId).can('workspace.import') === true\n"
b = "  const mayImport: boolean = usePermissions(workspaceId).can('workspace.import') === true || true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-9-demo-card-for-everyone: the demo card offers everyone')
