# A GUEST JOINS THE WORKSPACE'S ROOM again, and hears every public channel's
# messages whole as they are written.
# Reddens: guest-chat-scope: "a guest’s socket is refused the workspace’s room, hears nothing said in a channel they may not read, and hears what is said in one they may — a member hears the workspace’s channel"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    if (kind === 'workspace' && membership.role === 'guest') return false"
b = "    if (kind === 'workspace' && membership.role === 'guest' && id === '') return false"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcs-3-guests-join-the-workspace-room: a guest joins the workspace room')
