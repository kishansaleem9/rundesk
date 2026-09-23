# ANY NOTIFICATION AS A CURSOR: paging by somebody else's row dates it.
# Reddens: inbox-scope: "and a cursor that is somebody else’s notification is refused — it would date their row"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '    if (opts.before) await this.assertOwnAnchor(userId, opts.before)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-10-foreign-anchor: applied")
