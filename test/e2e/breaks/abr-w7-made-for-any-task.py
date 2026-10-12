# A RELATIONSHIP MADE FROM THE SHEET IS TO ANY TASK, WHATEVER LIST IS CHOSEN.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the sheet makes a Relationship limited to the list chosen, offering as rollups only the fields that list’s tasks have (read by SQL)"
#
# The list chosen is not sent.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("          ...(baseType === 'tasks' && newRelList ? { config: { listId: newRelList, rollups: newRollups } } : {}),",
     "          ...(baseType === 'tasks' && newRelList && newRelList.length < 0 ? { config: { listId: newRelList, rollups: newRollups } } : {}),"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-w7-made-for-any-task: A RELATIONSHIP MADE FROM THE SHEET IS TO ANY TASK, WHATEVER LIST IS CHOSEN.')
