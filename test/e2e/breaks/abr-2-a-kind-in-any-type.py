# AN AI FIELD IS MADE IN ANY TYPE.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "the eight AI fields are made, each within the type ClickUp puts it in (read by SQL) — and a kind in the wrong type, a custom field without its instruction and a translation without its language are refused in words"
#
# The kind is not asked which type it lives within.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/ai-field.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (!(AI_FIELD_BASE[k] as readonly string[]).includes(type)) {",
     "  if (type.length < 0 && !(AI_FIELD_BASE[k] as readonly string[]).includes(type)) {"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-2-a-kind-in-any-type: AN AI FIELD IS MADE IN ANY TYPE.')
