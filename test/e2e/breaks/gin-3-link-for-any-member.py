# AN INVITATION'S LINK IS GIVEN TO ANY SIGNED-IN PERSON.
# Re-aimed: the link asks `assertMayHandleInvitation` (members.invite) now (settings-tabs-by-key).
# Reddens: guest-invitations: "an invitation’s token reaches only those who may copy its link: the member’s list carries none, and the link is refused to a member and given to the admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await this.assertMayHandleInvitation(id, req.user)\n    return this.invitationsService.getClaimUrlById(id)\n'
b = '    return this.invitationsService.getClaimUrlById(id)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("gin-3-link-for-any-member: an invitation's link is given to any signed-in person")
