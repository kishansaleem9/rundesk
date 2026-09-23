# A CURSOR ON THE TIMESTAMP ALONE: a row sharing the anchor's instant is on neither page.
# Reddens: inbox-scope: "and when two rows share an instant, the one ordered second opens page two"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '    return sql`(${notifications.createdAt}, ${notifications.id}) < (select a.created_at, a.id from ${notifications} a where a.id = ${anchorId})`\n'
b = '    return sql`${notifications.createdAt} < (select a.created_at from ${notifications} a where a.id = ${anchorId})`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-6-cursor-ignores-ties: applied")
