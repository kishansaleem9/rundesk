# AN ACCESS ASK ABOUT ANYTHING IS RECORDED AND ANSWERED, READ FROM ITS UNIT TEST (`found-30-sep/access-asks-from-outside-the-workspace`).
#
# Reddens: unit: request-access.test.ts "answers an id the named workspace does not hold, or no id at all, with one 404, recording nothing and telling nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    if (!isUuid(workspaceId) || !isUuid(objectId)) throw new NotFoundException(NOTHING_TO_ASK_FOR)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a2 = "    if (!meta) throw new NotFoundException(NOTHING_TO_ASK_FOR)\n"
assert s.count(a2) == 1
s = s.replace(a2, "")
s = s.replace("    const what = meta.name ?? `this ${type}`", "    const what = meta?.name ?? `this ${type}`")
s = s.replace("url: meta.url ?? `/app/${workspaceId}` },", "url: meta?.url ?? `/app/${workspaceId}` },")
io.open(p, 'w', encoding='utf-8').write(s)
print('request-access-7-an-ask-about-anything-is-recorded-unit: no id is refused')
