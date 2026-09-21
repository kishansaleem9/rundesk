# The derived field accepts a write it will never read back — the mirror defect,
# with the row in Postgres standing as evidence for a number nothing uses.
# Reddens: custom-field-types: "writing to it is refused, so no row can ever contradict the computation"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if (def.type === 'formula') {\n      throw new BadRequestException(\n        'Formula is calculated from the other fields on this task — it cannot be set directly',\n      )\n    }\n"
b = "    if (def.type === 'formula' && false) {\n      throw new BadRequestException(\n        'Formula is calculated from the other fields on this task — it cannot be set directly',\n      )\n    }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: a formula now accepts a write.')
