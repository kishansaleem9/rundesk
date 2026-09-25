# A MANAGER MAY INVITE NOBODY: the refusal half with no grant half.
# Re-aimed: inviting asks `members.invite` now (settings-tabs-by-key); the manager is refused beside it.
# Reddens: credential-reads: "a manager may invite a member but not a workspace admin — nobody grants more than they hold"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    if (!(await this.mayInvite(body.workspaceId, user))) {\n"
b = "    if (!(await this.mayInvite(body.workspaceId, user)) || membership?.role === 'manager') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-9-manager-invites-nobody: applied")
