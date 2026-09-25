# THE IMPORT PAGE OFFERS ITS FORMS TO EVERYBODY, AS IT DID: the manager is shown the spreadsheet import.
# Reddens: data-transfer-keys: "the import page offers the member granted workspace.import the spreadsheet and ClickUp imports — and tells the manager importing is not theirs, offering neither"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayImport = usePermissions(workspaceId).can('workspace.import') === true\n"
b = "  const mayImport: boolean = usePermissions(workspaceId).can('workspace.import') === true || true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-8-import-forms-for-everyone: the import page offers everyone')
