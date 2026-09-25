# A GUEST READS EVERY PENDING INVITATION AGAIN.
# Reddens: guest-invitations: "a guest reads no pending invitation — no invitee, no role — while a member reads them, for the pickers that offer people invited"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (membership.role === 'guest') return []\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('gin-1-guests-read-invitations: a guest reads every pending invitation again')
