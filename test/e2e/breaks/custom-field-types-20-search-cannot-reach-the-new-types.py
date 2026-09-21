# The search box looks only at the types that existed before 0158, so typing the
# name of a new one selects nothing and the picker stays where it was.
# Reddens: custom-field-types: "and the search box reaches the new types in one gesture"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '                  const hit = CREATABLE_FIELD_TYPES.find((ft) =>\n                    t(ft.labelKey).toLowerCase().includes(q),\n                  )\n'
b = '                  const hit = CREATABLE_FIELD_TYPES.slice(0, 19).find((ft) =>\n                    t(ft.labelKey).toLowerCase().includes(q),\n                  )\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the type search cannot reach the types added in 0158.')
