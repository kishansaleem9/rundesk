# THE @ TASKS TAB ASKS FOR THE NEWEST TASKS AND FILTERS THEM HERE, as it did.
# Reddens: task-pickers-search: "typing @@ and its word in a comment shows the search in flight, not \"no matching tasks\" — and then offers the oldest task"no matching tasks"typing @@ and its word in a comment shows the search in flight, not \"no matching tasks\" — and then offers the oldest task"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = '  const mentionTasksQuery = useTaskSearch<MentionTaskLite>(workspaceId, mentionQuery, {\n'
b = "  const mentionTasksQuery = useTaskSearch<MentionTaskLite>(workspaceId, '', {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tps-5-mention-newest-only: applied")
