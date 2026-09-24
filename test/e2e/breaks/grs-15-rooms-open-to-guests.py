# A GUEST JOINS ANY ROOM a member could: the open list's, the list they only
# pass through, the task beside theirs — and hears every task made and every
# comment posted there.
# Reddens: guest-read-scope: "a guest joins the rooms of what is shared with them and hears it — not the open list’s, nor the room of a list they only pass through, nor the task beside theirs"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    if (workspaceRole === 'guest') {\n"
b = "    if (workspaceRole === 'guest' && listId === '') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-15-rooms-open-to-guests: a guest joins any room')
