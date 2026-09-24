# A GUEST OPENS ANY PUBLIC CHANNEL by id, and joins it: the per-channel rule
# forgets the guest.
# Reddens: guest-chat-scope: "a guest reads the messages of those three, and is refused the workspace’s channel — which they had once opened — and the open space’s; a member reads the open space’s"
#   or "a guest cannot join a channel nothing shares with them, and it stays unread"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = "    if (membership.role === 'guest' && !channel.isPrivate && !channel.isDm && !(await channelReachesGuest(this.db, channel, userId))) {"
b = "    if (membership.role === 'guest' && !channel.isPrivate && !channel.isDm && !(await channelReachesGuest(this.db, channel, userId)) && channel.name === '') {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcs-2-channel-check-forgets-guests: a guest opens any public channel')
