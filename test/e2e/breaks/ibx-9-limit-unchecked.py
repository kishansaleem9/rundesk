# A PAGE SIZE NOBODY CHECKS: any number is quietly clamped.
# Reddens: inbox-scope: "a page larger than a hundred is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.controller.ts'
a = '      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > INBOX_PAGE_MAX) {\n        throw new BadRequestException(`limit must be a whole number from 1 to ${INBOX_PAGE_MAX}`)\n      }\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-9-limit-unchecked: applied")
