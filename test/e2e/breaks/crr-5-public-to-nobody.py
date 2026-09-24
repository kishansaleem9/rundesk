# A PUBLIC CHANNEL'S EVENTS REACH NOBODY: the fix read as "send less".
# RE-AIMED 24 September: the readers are `{ workspace, users }` now — the workspace's
# room, and each guest a public channel reaches told in their own
# (`found-24-sep/guests-read-every-open-channel`); the mistake is the same.
# Reddens: chat-realtime-access: "a public channel’s message still reaches every member, the outsider included"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = "    return { workspace: true, users: guests.map((g) => g.userId) }\n"
b = '    return { workspace: false, users: [] }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-5-public-to-nobody: applied")
