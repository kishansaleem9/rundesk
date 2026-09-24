# THE RULE FORGETS THAT A PRIVATE CHANNEL OR A DM IS ITS MEMBERS': every one reads as public.
# Reddens: workspace-read-access: "a member’s chat activity, read by someone outside their DM and private channels, holds none of them — only what the reader can open"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = '      and(eq(chatChannels.isPrivate, false), eq(chatChannels.isDm, false)),\n'
b = '      eq(chatChannels.workspaceId, workspaceId),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-16-private-channels-open: applied")
