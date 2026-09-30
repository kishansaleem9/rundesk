# A WRITE THE CALLER'S LEVEL DOES NOT ALLOW IS ANSWERED 404, AS IF THE TASK WERE NOT THERE: the one refusal that
# should stay 403, since the caller opens the task and needs to know why they may not change it.
# Reddens: refused-as-missing: "a write to a task the member may open but not change is still refused with 403, saying why — it is theirs to know about"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "import { ForbiddenException } from '@nestjs/common'\n"
b = "import { ForbiddenException, NotFoundException } from '@nestjs/common'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = '  if (spaceLevelReaches(resolved.level, params.required)) return\n  throw new ForbiddenException(\n'
b = '  if (spaceLevelReaches(resolved.level, params.required)) return\n  throw new NotFoundException(\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-11-a-write-refusal-says-nothing: a level refusal is a 404')
