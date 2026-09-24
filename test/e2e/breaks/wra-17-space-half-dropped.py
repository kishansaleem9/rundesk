# THE RULE FORGETS THE PRIVATE SPACE: a space's channels read by members the space refuses.
# Reddens: workspace-read-access: "while someone in the DM and the private channel reads both — and still not a channel of a space they are refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = '    or(isNull(chatChannels.spaceId), notInArray(chatChannels.spaceId, privateSpaces), inArray(chatChannels.spaceId, memberSpaces)),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-17-space-half-dropped: applied")
