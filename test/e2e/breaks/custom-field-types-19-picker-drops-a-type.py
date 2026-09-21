# The modal picker loses one of the types the column holds. Each picker is
# individually plausible, which is why the duplicated list goes unnoticed.
# Reddens: custom-field-types: "the modal's picker offers all 22 types"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "  { value: 'signature', labelKey: 'taskDetail.fieldType.signature' },\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the picker no longer offers signature.')
