# THE IMPORT PAGE READS "STILL ASKING" AS "REFUSED", AS IT DID UNTIL 1 OCTOBER:
# while the member's permissions are being read, a member granted
# workspace.import is told importing is not theirs. Found by the check above
# it under a full CI run's load; the check written for it holds the read.
# Reddens: data-transfer-keys: "while its permissions are still being asked, the import page waits: it tells the member granted workspace.import neither that importing is not theirs nor offers the import"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-import-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayImport = usePermissions(workspaceId).can('workspace.import')\n"
b = "  const mayImport = usePermissions(workspaceId).can('workspace.import') === true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-10-import-page-reads-asking-as-refused: still asking reads as not yours')
