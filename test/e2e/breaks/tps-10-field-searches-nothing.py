# THE TASKS FIELD OFFERS THE NEWEST TASKS WHATEVER IS TYPED.
# Reddens: task-pickers-search: "a Tasks field finds it by search, relates it, and draws it by title"
#
# Re-aimed 12 October: the field's search passes the list it is limited to, if any. Same break.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "  const results = useTaskSearch<MentionTaskLite>(workspaceId, search, { key: 'cf-tasks', enabled: picking, listId })\n"
b = "  const results = useTaskSearch<MentionTaskLite>(workspaceId, '', { key: 'cf-tasks', enabled: picking, listId })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-10-field-searches-nothing: applied")
