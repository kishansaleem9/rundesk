# WHAT THE MODEL WROTE IS KEPT BUT NOT DRAWN.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the sheet offers ✦ Generate on an AI field, and what the model wrote is drawn in the field and kept (read by SQL)"
#
# The field’s editor keeps what it drew before the value changed.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("                key={`${definition.id}:${JSON.stringify(value)}`}\n",
     "                key={definition.id}\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-w8-a-generated-value-not-drawn: WHAT THE MODEL WROTE IS KEPT BUT NOT DRAWN.')
