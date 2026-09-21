# A task may point at itself, which draws a row that navigates to the page you
# are already on.
# Reddens: custom-field-types: "and so is a task pointing at itself"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "          if ((value as string[]).includes(taskId)) {\n            throw new BadRequestException('A task cannot be related to itself')\n          }\n"
b = "          if ((value as string[]).includes(taskId) && false) {\n            throw new BadRequestException('A task cannot be related to itself')\n          }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: a task may now relate to itself.')
