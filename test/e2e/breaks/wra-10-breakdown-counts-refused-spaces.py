# THE STATUS BREAKDOWN COUNTS TASKS IN SPACES THE MEMBER IS REFUSED, as it did.
# Re-anchored when the task reads took the list's own privacy with the
# container rule (`taskInReachFilter`; `found-24-sep/private-lists-skipped-by-task-reads`);
# the edit is the same: the rule it names is taken out.
# Reddens: workspace-read-access: "the AI’s status breakdown counts, for a member, nothing from a space they are refused nor a private task — the admin’s counts all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '          // Both rules: this counted tasks in private spaces the actor is refused.\n          taskInReachFilter(this.db, workspaceId, actorId, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-10-breakdown-counts-refused-spaces: applied")
