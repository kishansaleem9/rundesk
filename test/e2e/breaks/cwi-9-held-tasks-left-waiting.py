# ACCEPTING AN INVITATION GIVES NOBODY THE TASKS HELD FOR THEM.
# (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
# Reddens: clickup-workspace-import: "Nina accepts and is on her two tasks; Ola joins as an admin, as ClickUp had her, and is on hers; nothing is held for either any longer"
#   or "Gil joins as a guest and is not put on the task held for him — nothing is shared with him, so the assignee route would refuse it — and it is held no longer"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      await this.takePendingAssignees(ws.workspaceId, invite.email, result.userId!)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cwi-9-held-tasks-left-waiting: ACCEPTING AN INVITATION GIVES NOBODY THE TASKS HELD FOR THEM.')
