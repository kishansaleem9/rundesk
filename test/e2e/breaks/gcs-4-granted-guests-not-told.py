# A GUEST A PUBLIC CHANNEL REACHES HEARS NOTHING of it: out of the workspace's
# room, and no longer told in their own.
# Reddens: guest-chat-scope: "a guest’s socket is refused the workspace’s room, hears nothing said in a channel they may not read, and hears what is said in one they may — a member hears the workspace’s channel"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = '    return { workspace: true, users: guests.map((g) => g.userId) }'
b = "    return { workspace: true, users: guests.map((g) => g.userId).filter((id) => id === '') }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcs-4-granted-guests-not-told: a guest a public channel reaches is not told')
