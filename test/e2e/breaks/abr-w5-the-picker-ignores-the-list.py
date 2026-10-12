# A RELATIONSHIP’S PICKER OFFERS ANY TASK OF THE WORKSPACE.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the sheet draws each related task’s rolled-up value beside it, and its picker offers the Clients list’s tasks and no task outside it"
#
# The picker does not ask for the field’s list.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const results = useTaskSearch<MentionTaskLite>(workspaceId, search, { key: 'cf-tasks', enabled: picking, listId })",
     "  const results = useTaskSearch<MentionTaskLite>(workspaceId, search, { key: 'cf-tasks', enabled: picking, listId: listId && null })"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-w5-the-picker-ignores-the-list: A RELATIONSHIP’S PICKER OFFERS ANY TASK OF THE WORKSPACE.')
