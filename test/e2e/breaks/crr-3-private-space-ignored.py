# A PRIVATE SPACE'S CHANNEL IS READ AS THE WORKSPACE'S: the space is never asked.
# Reddens: chat-realtime-access: "a member refused a private space hears nothing from its channel — the admin, in the space, hears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/chat/channel-read-filter.ts'
a = "    privateSpace = space?.visibility === 'private'\n"
b = '    void space\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crr-3-private-space-ignored: applied")
