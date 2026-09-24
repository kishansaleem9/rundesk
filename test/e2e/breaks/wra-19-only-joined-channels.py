# A RULE THAT READS ONLY CHANNELS YOU JOINED: public channels vanish for anyone who has not opened them.
# Reddens: workspace-read-access: "while someone in the DM and the private channel reads both — and still not a channel of a space they are refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = '      and(eq(chatChannels.isPrivate, false), eq(chatChannels.isDm, false)),\n'
b = '      and(eq(chatChannels.isPrivate, false), eq(chatChannels.isDm, false), inArray(chatChannels.id, memberChannels)),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-19-only-joined-channels: applied")
