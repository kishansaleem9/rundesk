# CLAIMING KEEPS AN `owner` ON THE ROW.
# Reddens: credential-reads: "and an invitation written before these rules, claimed, joins its own workspace as asked — not the other organisation’s, and not as owner"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = "          role: (INVITE_ORG_ROLES as readonly string[]).includes(invite.orgRole) ? invite.orgRole : 'member',\n"
b = '          role: invite.orgRole,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-11-claim-keeps-owner: applied")
