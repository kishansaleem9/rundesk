# THE CONVERT DIALOG ASKS FOR THE NEWEST TASKS AND FILTERS THEM HERE.
# Reddens: task-pickers-search: "the convert dialog finds it — and never offers a subtask as a parent"
import io
p = '/home/user/rundesk/apps/web/src/components/task-convert-dialog.tsx'
a = '  const candidatesQuery = useTaskSearch<Candidate>(workspaceId, search, {\n'
b = "  const candidatesQuery = useTaskSearch<Candidate>(workspaceId, '', {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-9-convert-newest-only: applied")
