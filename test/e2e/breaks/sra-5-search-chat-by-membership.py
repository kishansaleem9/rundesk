# SEARCH'S CHAT BY THE PUBLIC HALF OF ITS OLD COPY OF THE RULE: a public channel is readable, the space it is in never asked.
# Reddens: search-read-access: "a member’s search finds nothing of a space they are refused, of any kind — while it finds every kind in the open space, and the admin’s finds both"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '    const accessibleChannel = readableChannelsFilter(this.db, userId, workspaceId)\n'
b = '    const accessibleChannel = and(eq(chatChannels.isPrivate, false), eq(chatChannels.isDm, false))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-5-search-chat-by-membership: applied")
