# A tasks field will store an id from anywhere, including a workspace the reader
# cannot open. The row renders as a reference that goes nowhere.
# Reddens: custom-field-types: "a task id from outside this workspace is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "            const known = new Set(rows.map((r) => r.id))\n            if ((value as string[]).some((v) => !known.has(v))) {\n              throw new BadRequestException('Those tasks are not in this workspace')\n            }\n"
b = '            const known = new Set(rows.map((r) => r.id))\n            void known\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: a tasks field accepts ids from outside the workspace.')
