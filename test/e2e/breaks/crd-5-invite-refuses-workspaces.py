# NO INVITATION MAY NAME A WORKSPACE AT ALL: the refusal half with no grant half.
# Reddens: credential-reads: "while the same owner inviting someone to their own workspace is written as asked"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = '    const memberships = await this.checkedMemberships(organizationId, dto.workspaceMemberships)\n'
b = "    if (Array.isArray(dto.workspaceMemberships) && dto.workspaceMemberships.length > 0) throw new BadRequestException('No workspaces')\n    const memberships = await this.checkedMemberships(organizationId, dto.workspaceMemberships)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-5-invite-refuses-workspaces: applied")
