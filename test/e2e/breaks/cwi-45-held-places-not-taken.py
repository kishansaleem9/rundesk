# JOINING TAKES NONE OF THE CHANNEL PLACES HELD.
# (`found-14-oct/clickup-import-rest-unimported`)
# Reddens: clickup-workspace-import: "and she is in her direct message with the admin and in Leads, as she was in ClickUp, her places held no longer"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      await this.takePendingChannels(ws.workspaceId, invite.email, result.userId!)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-45-held-places-not-taken: JOINING TAKES NONE OF THE CHANNEL PLACES HELD.')
