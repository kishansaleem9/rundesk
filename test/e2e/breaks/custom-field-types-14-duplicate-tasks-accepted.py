# The same task can be stored twice, and the panel then draws the same row twice.
# Reddens: custom-field-types: "and the same task given twice, which would draw the same row twice"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "          if (new Set(value).size !== value.length) {\n            throw new BadRequestException('The same task was given twice')\n          }\n"
b = "          if (new Set(value).size !== value.length && false) {\n            throw new BadRequestException('The same task was given twice')\n          }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: duplicate task ids are accepted.')
