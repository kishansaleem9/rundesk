# CLAIMING GRANTS WHATEVER THE ROW SAYS, other organisations' workspaces included.
# Reddens: credential-reads: "and an invitation written before these rules, claimed, joins its own workspace as asked — not the other organisation’s, and not as owner"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = '      .filter((m) => ok.has(m.workspaceId))\n'
b = '      .filter((m) => ok.has(m.workspaceId) || m.workspaceId.length > 0)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-10-claim-trusts-the-row: applied")
