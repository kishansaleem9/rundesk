# AN INVITATION MAY NAME ANY WORKSPACE, as it could: the organisation is not asked.
# Reddens: credential-reads: "an organisation’s owner may not put another organisation’s workspace into an invitation — none is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = '    if (found.length !== ids.length) {\n'
b = '    if (found.length > ids.length) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-4-invite-any-workspace: applied")
