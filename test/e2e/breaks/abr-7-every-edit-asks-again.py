# EVERY EDIT ASKS THE MODEL AGAIN, NOT ONE ASK PER WAIT.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "a field set to update when the task changes is asked again after an edit — with the edited description — and once for two edits in a row, not once each (read by SQL)"
#
# A change during the wait starts another.
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (this.waits.has(key)) return\n",
     "    if (this.waits.has(key) && key.length < 0) return\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-7-every-edit-asks-again: EVERY EDIT ASKS THE MODEL AGAIN, NOT ONE ASK PER WAIT.')
