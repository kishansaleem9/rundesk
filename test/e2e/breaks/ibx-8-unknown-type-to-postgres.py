# AN UNKNOWN TYPE PASSED THROUGH: Postgres refuses the enum, and nobody is told which.
# Reddens: inbox-scope: "an unknown type is refused by name"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.controller.ts'
a = "    const unknown = named.filter((t) => !NOTIFICATION_TYPES.includes(t))\n    if (unknown.length) throw new BadRequestException(`Unknown notification type: ${unknown.join(', ')}`)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-8-unknown-type-to-postgres: applied")
