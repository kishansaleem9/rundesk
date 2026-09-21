# A reference to a field that does not exist is skipped instead of refused — the
# typo saves, and the field is then indistinguishable from an empty one.
# Reddens: custom-field-types: "a reference to a field that does not exist is refused, naming the one it could not find"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '      if (hits.length === 0) {\n        throw new BadRequestException(`Formula: there is no field called "${ref}" on this project`)\n      }\n'
b = '      if (hits.length === 0) {\n        continue\n      }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: an unknown field reference is accepted and ignored.')
