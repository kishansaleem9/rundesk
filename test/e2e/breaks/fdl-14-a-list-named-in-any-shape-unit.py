# A LIST IS TAKEN IN ANY SHAPE, as `fdl-9`, for the unit tests of `createDefinition` (`found-30-sep/field-definition-takes-a-foreign-list`, its review).
# Reddens: unit: custom-fields.service.test.ts "refuses a list named by anything but its id, before it is asked of anybody, and stores nothing (400)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if (dto.listId != null && typeof dto.listId !== 'string') {\n      throw new BadRequestException('listId must be a string or null')\n    }\n"
b = '    // BROKEN: a listId of any shape is taken\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-14-a-list-named-in-any-shape-unit: a list is taken in any shape')
