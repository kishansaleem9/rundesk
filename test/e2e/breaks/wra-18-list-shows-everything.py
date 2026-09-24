# THE CHANNEL LIST WITH NO RULE AT ALL: every channel of the workspace, by name, to anyone.
# Reddens: workspace-read-access: "the channel list names no channel of a private space the member is not in — the admin’s names it"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/chat.service.ts'
a = '          readableChannelsFilter(this.db, userId, workspaceId),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-18-list-shows-everything: applied")
