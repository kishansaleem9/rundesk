# A CHANNEL FAVOURITED BY ID WITH NO RULE, as it was: a private channel's name to someone outside it.
# Reddens: lookup-read-access: "a member cannot favourite anything of a space they are refused, nor a channel closed to them (404 each, no row) — while they favourite the open ones"
import io
p = '/home/user/rundesk/apps/api/src/modules/favorites/favorites.service.ts'
a = '        .where(and(eq(chatChannels.workspaceId, workspaceId), inArray(chatChannels.id, ids), readableChannelsFilter(this.db, actor.id, workspaceId)))\n'
b = '        .where(and(eq(chatChannels.workspaceId, workspaceId), inArray(chatChannels.id, ids)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-5-favourite-any-channel: applied")
