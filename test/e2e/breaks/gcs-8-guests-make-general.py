# A GUEST LISTING THE CHANNELS MAKES #general, which a guest may not: the
# listing answers 403, and the guest's channels are listed nowhere.
# Reddens: guest-chat-scope: "a guest is listed the channels of a space shared with them, one shared with them and a private one they were invited to — not the workspace’s, nor an open space’s — a member is listed both"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "    if (caller?.role === 'guest') return null"
b = "    if (caller?.role === 'guest' && workspaceId === '') return null"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gcs-8-guests-make-general: a guest's listing makes #general")
