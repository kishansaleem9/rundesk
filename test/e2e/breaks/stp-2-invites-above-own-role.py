# THE RANK RULE IS GONE: a member granted members.invite invites a manager.
# Reddens: settings-tabs-by-key: "a member granted members.invite invites a member, and no one above themself (403 for a manager) — a plain member invites no one, and a manager invites no admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (roleRank(body.role ?? 'member') > own) {\n"
b = "    if (roleRank(body.role ?? 'member') > own && false) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('stp-2-invites-above-own-role: no rank rule on invitations')
