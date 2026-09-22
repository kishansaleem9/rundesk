# The modal picker loses one of the types the column holds. Each picker is
# individually plausible, which is why the duplicated list goes unnoticed.
# THE COUNT IS NOT QUOTED. The suite interpolates it — `all ${ALL_TYPES.length}
# types` — so a number here is a hostage to the next type anybody adds, which
# is how `tfc-3-short-type-list` came to claim 19 against a run printing 22.
# Reddens: custom-field-types: "the modal's picker offers all"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "  { value: 'signature', labelKey: 'taskDetail.fieldType.signature' },\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the picker no longer offers signature.')
