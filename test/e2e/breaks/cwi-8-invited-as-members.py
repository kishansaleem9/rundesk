# EVERYBODY THE IMPORT INVITES IS INVITED AS A MEMBER, WHATEVER WAS CHOSEN.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "each of the four is invited into this workspace once, with ClickUp’s role for them, and the invitation is emailed; their five tasks wait for them, while Ana, a member, is on hers already"
#   or "Nina accepts and is on her two tasks; Ola joins as an admin, as ClickUp had her, and is on hers; nothing is held for either any longer"
#   or "Gil joins as a guest and is not put on the task held for him — nothing is shared with him, so the assignee route would refuse it — and it is held no longer"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/app-import.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      await this.invitationsService!.create(ws.organizationId, importer.id, { email: c.email, orgRole: 'member', workspaceMemberships: [{ workspaceId, role: c.role }] })\n",
     "      await this.invitationsService!.create(ws.organizationId, importer.id, { email: c.email, orgRole: 'member', workspaceMemberships: [{ workspaceId, role: 'member' }] })\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-8-invited-as-members: EVERYBODY THE IMPORT INVITES IS INVITED AS A MEMBER, WHATEVER WAS CHOSEN.')
