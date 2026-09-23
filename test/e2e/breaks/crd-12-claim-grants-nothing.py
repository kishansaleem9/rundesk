# CLAIMING GRANTS NO WORKSPACE AT ALL: the refusal half with no grant half.
# Reddens: credential-reads: "and an invitation written before these rules, claimed, joins its own workspace as asked — not the other organisation’s, and not as owner"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = '    if (wanted.length === 0) return []\n'
b = '    if (wanted.length >= 0) return []\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-12-claim-grants-nothing: applied")
