# TIME HELD FOR SOMEBODY INVITED IS NOT THEIRS WHEN THEY JOIN.
# (`found-14-oct/clickup-docs-time-goals-unimported`)
# Reddens: clickup-workspace-import: "and the half hour Nina tracked on Fix login is hers now that she has joined, held no longer"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      await this.takePendingTime(ws.workspaceId, invite.email, result.userId!)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-21-held-time-never-claimed: TIME HELD FOR SOMEBODY INVITED IS NOT THEIRS WHEN THEY JOIN.')
