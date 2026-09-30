# `request-access-6`'s edit, claimed by the unit test beside the service.
# Reddens: unit: request-access.test.ts "records an ask about an id that names nothing here, answers it as sent, and tells nobody"
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
print('rac-1-an-ask-about-nothing-tells-the-admins-unit: an ask about nothing reaches the admins')
