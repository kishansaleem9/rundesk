# AN ASK ABOUT AN ID NAMING NOTHING IS CARRIED TO EVERY ADMIN, "… asked for access to this task", as it was: the
# card is on every "not found" now, so a link to a deleted task would do it from the page.
# Reddens: request-access: "asking for access to an id that names nothing is answered as asking for a private task, word for word — and tells nobody, where the private task’s ask reaches the admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    if (!meta) return { status: 'sent', notified: 0 }\n    const what = meta.name\n"
b = '    const what = meta?.name ?? `this ${type}`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = '        target: { entityType: type, entityId: objectId, url: meta.url },\n'
b = '        target: { entityType: type, entityId: objectId, url: meta?.url ?? `/app/${workspaceId}` },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('request-access-6-an-ask-about-nothing-tells-the-admins: an ask about nothing reaches the admins')
