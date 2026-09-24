# A DM COUNTS AS A PUBLIC CHANNEL: its messages go to the whole workspace.
# Re-aimed: the first version only dropped `!channel.isDm`, and a DM is stored
# `isPrivate: true` as well, so nothing changed and it reddened nothing. The
# mistake this stands for is reading "private" as "a private CHANNEL" and
# letting a DM, which is not one, through.
# RE-AIMED 24 September: the readers are `{ workspace, users }` now — the workspace's
# room, and each guest a public channel reaches told in their own
# (`found-24-sep/guests-read-every-open-channel`); the mistake is the same.
# Reddens: chat-realtime-access: "a member outside a DM hears nothing of it, the message or its edit — the other person in it hears both"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = "  if (!privateSpace && !channel.isPrivate && !channel.isDm) {\n"
b = "  if (!privateSpace && (!channel.isPrivate || channel.isDm)) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-1-dms-are-public: applied")
