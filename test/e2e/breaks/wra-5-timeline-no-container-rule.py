# THE TIMELINE SKIPS THE CONTAINER RULE, as it did: a private space's dated tasks are on everybody's timeline.
# Re-anchored when the task reads took the list's own privacy with the
# container rule (`taskInReachFilter`; `found-24-sep/private-lists-skipped-by-task-reads`);
# the edit is the same: the rule it names is taken out.
# Reddens: workspace-read-access: "a member’s timeline has nothing from a space they are refused, nor a private task — while the rest are on it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          taskInReachFilter(this.db, workspaceId, opts.actor.id, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-5-timeline-no-container-rule: applied")
