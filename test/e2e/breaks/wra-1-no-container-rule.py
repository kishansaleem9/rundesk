# THE READ SKIPS THE CONTAINER RULE, as it did: a private space's tasks go to anybody who asks for the assignee's list.
# Re-anchored when the task reads took the list's own privacy with the
# container rule (`taskInReachFilter`; `found-24-sep/private-lists-skipped-by-task-reads`);
# the edit is the same: the rule it names is taken out.
# Reddens: workspace-read-access: "a member reading the admin’s tasks gets none from a space they are refused, nor a private task — while the rest are listed"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          taskInReachFilter(this.db, workspaceId, actor.id, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-1-no-container-rule: applied")
