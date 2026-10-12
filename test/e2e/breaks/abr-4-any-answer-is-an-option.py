# A DROPDOWN AI FIELD KEEPS AN ANSWER THAT IS NONE OF ITS OPTIONS AS ITS FIRST.
# (`commit-log/log-c980bee-1`, `ledger-rows/row-719`)
# Reddens: ai-button-relationship-fields: "Categorize is asked to choose among its own options and keeps the one named (read by SQL); an answer that is none of them is refused in words (502) and the value stays"
#
# An answer that names no option is taken as the first option.
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/ai-field.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    return hit\n      ? { value: hit.value }\n      : { refused:",
     "    return hit || opts[0]\n      ? { value: (hit ?? opts[0])!.value }\n      : { refused:"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('abr-4-any-answer-is-an-option: A DROPDOWN AI FIELD KEEPS AN ANSWER THAT IS NONE OF ITS OPTIONS AS ITS FIRST.')
