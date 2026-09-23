# A TYPE FILTER THE SERVER IGNORES: every type answers every `types=`.
# Reddens: inbox-scope: "a type filter is the server’s: two replies, one assigned comment, fifty-six assignments"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '      scope.types?.length ? inArray(notifications.type, scope.types as never) : undefined,\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-4-types-ignored: applied")
