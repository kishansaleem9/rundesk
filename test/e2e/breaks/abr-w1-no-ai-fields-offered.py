# THE FIELD PICKER OFFERS NO AI FIELD.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the sheet’s field picker offers the eight AI fields, asks a custom one for its instruction, and makes it as a Long Text with its settings (read by SQL)"
#
# The AI fields are left out of the picker.
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("            {AI_FIELD_CHOICES.map((c) => (\n              <option key={c.kind} value={`ai:${c.kind}`}>",
     "            {AI_FIELD_CHOICES.filter((c) => c.kind.length < 0).map((c) => (\n              <option key={c.kind} value={`ai:${c.kind}`}>"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-w1-no-ai-fields-offered: THE FIELD PICKER OFFERS NO AI FIELD.')
