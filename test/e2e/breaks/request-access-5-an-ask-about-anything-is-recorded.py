# AN ACCESS ASK ABOUT ANYTHING IS RECORDED AND ANSWERED (`found-30-sep/access-asks-from-outside-the-workspace`).
#
# The ask must name one of the named workspace's own objects; anything else is
# one 404. Let the lookup find nothing and go on, as it did, and a made-up id,
# another workspace's task and a made-up workspace are each answered, recorded,
# and told apart.
#
# Reddens: request-access:
#   "an ask about anything the workspace does not hold is one 404, in the same words whatever was named, and nothing is recorded"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    if (!meta) throw new NotFoundException(NOTHING_TO_ASK_FOR)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
# what reads the object's name after it then reads it as possibly missing, as before
s = s.replace("    const what = meta.name ?? `this ${type}`", "    const what = meta?.name ?? `this ${type}`")
s = s.replace("url: meta.url ?? `/app/${workspaceId}` },", "url: meta?.url ?? `/app/${workspaceId}` },")
io.open(p, 'w', encoding='utf-8').write(s)
print('request-access-5-an-ask-about-anything-is-recorded: an ask about anything is answered and recorded')
