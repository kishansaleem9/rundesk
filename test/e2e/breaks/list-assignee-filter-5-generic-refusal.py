# THE STATUS-CODE PATCH. The refusal is still a 400 — only its message goes
# generic. A check that asserted the status alone could not tell this
# refusal from a validation pipe's, and would pass here.
# Reddens ONLY: "the refusal says what is missing".
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!opts.userId) throw new BadRequestException('userId is required')"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "    if (!opts.userId) throw new BadRequestException('Bad request')"))
print('[break 5] The 400 no longer says which parameter was missing.')
