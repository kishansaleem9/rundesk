# The missing-person guard is gone, so a call with no `userId` answers 200
# with an empty result — indistinguishable from "this person has nothing".
# Reddens: "asking without a person is refused".
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!opts.userId) throw new BadRequestException('userId is required')"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, '    if (!opts.userId) return empty'))
print('[break 4] A call with no userId now returns a confident empty answer.')
