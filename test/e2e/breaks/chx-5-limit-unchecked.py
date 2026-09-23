# A PAGE SIZE NOBODY CHECKS: 500 is quietly clamped, `ten` reaches the query as NaN.
# Reddens: chat-history: "a cursor from another channel, and a page of 500, are refused with nothing listed"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.controller.ts'
a = '  if (!Number.isInteger(n) || n < 1 || n > max) {\n    throw new BadRequestException(`limit must be a whole number from 1 to ${max}`)\n  }\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("chx-5-limit-unchecked: applied")
