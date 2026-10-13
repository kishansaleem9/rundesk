# AN IMPORT READS ANY FILE UPLOADED IN THE WORKSPACE (security): the key is asked
# only for the workspace, so one member imports another's file by naming its key.
# (`commit-log/log-601eacc-2`, `ledger-rows/row-816`)
# Reddens: importers: "a member without the Import data permission is refused the import of her own file, and nobody imports a file somebody else uploaded"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/import-files.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const prefix = importFilePrefix(workspaceId, userId)\n  if (!key.startsWith(prefix)) return false\n  const rest = key.slice(prefix.length)\n  return /^[A-Za-z0-9._-]+$/.test(rest) && !rest.includes('..')",
     "  const prefix = `workspaces/${workspaceId}/imports/`\n  if (!key.startsWith(prefix)) return false\n  const rest = key.slice(prefix.length)\n  return /^[A-Za-z0-9._/-]+$/.test(rest) && !rest.includes('..') && !!userId"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imp-3-any-import-file-in-the-workspace-is-yours: an import reads anybody's file in the workspace")
