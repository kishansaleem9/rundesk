# THE MERGE DIALOG ASKS FOR THE NEWEST TASKS AND FILTERS THEM HERE.
# Reddens: task-pickers-search: "the merge dialog finds it"
import io
p = '/home/user/rundesk/apps/web/src/components/task-merge-dialog.tsx'
a = "  const candidatesQuery = useTaskSearch<Candidate>(workspaceId, search, { key: 'merge-targets', enabled: open })\n"
b = "  const candidatesQuery = useTaskSearch<Candidate>(workspaceId, '', { key: 'merge-targets', enabled: open })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-7-merge-newest-only: applied")
