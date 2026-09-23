# A MILLISECOND CURSOR — the anchor compared at the precision JSON carries,
# which is what sending the timestamp back would have been.
# Reddens: inbox-scope: "the row a few hundred microseconds older than the last of page one opens page two"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '(select a.created_at, a.id from ${notifications} a where a.id = ${anchorId})'
b = "(select date_trunc('milliseconds', a.created_at), a.id from ${notifications} a where a.id = ${anchorId})"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-5-cursor-millisecond: applied")
