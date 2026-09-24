# A SPACE SHARED WITH A GUEST OPENS NONE OF ITS CHANNELS: only a share of the
# channel itself reaches them.
# Reddens: guest-chat-scope: "a guest reads the messages of those three, and is refused the workspace’s channel — which they had once opened — and the open space’s; a member reads the open space’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = '  if (member) return true\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcs-9-space-grants-reach-no-guest: a space shared with a guest opens none of its channels')
