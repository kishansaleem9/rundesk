# EVERY PUBLIC CHANNEL IS LISTED TO A GUEST again, and search finds what is
# said in each: the SQL half of the channel rule forgets the guest.
# Reddens: guest-chat-scope: "a guest is listed the channels of a space shared with them, one shared with them and a private one they were invited to — not the workspace’s, nor an open space’s — a member is listed both"
#   or "search finds a guest nothing said in a channel they may not read — and finds it for a member"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = '      notExists(guestHere),\n'
b = '      notExists(guestHere),\n      eq(chatChannels.isPrivate, false),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcs-1-channel-list-forgets-guests: every public channel is listed to a guest')
