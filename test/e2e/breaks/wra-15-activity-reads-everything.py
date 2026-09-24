# A MEMBER'S ACTIVITY WITH NO CHANNEL RULE, as it was: every DM and private channel they wrote in, to anyone.
# Reddens: workspace-read-access: "a member’s chat activity, read by someone outside their DM and private channels, holds none of them — only what the reader can open"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '          readableChannelsFilter(this.db, requesterId, workspaceId),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-15-activity-reads-everything: applied")
