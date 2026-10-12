# A FIELD SET TO FILL NEW TASKS FILLS NONE.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a task made where a field set to fill new tasks is gets its value without anybody asking — that field’s, and no field not set to (read by SQL)"
#
# A task made is not listened for.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (change.type === 'task.created') {",
     "    if (change.type === 'task.created' && change.type.length < 0) {"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-6-new-tasks-are-not-filled: A FIELD SET TO FILL NEW TASKS FILLS NONE.')
