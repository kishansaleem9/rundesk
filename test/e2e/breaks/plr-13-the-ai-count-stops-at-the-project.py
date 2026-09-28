# THE AI'S STATUS COUNT ASKS THE SPACE AND THE PROJECT ONLY: a private list's tasks are counted.
# Reddens: private-list-reach: "the AI’s status count leaves the private list’s two tasks out of the member’s total — and counts them in the admin’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          // Both rules: this counted tasks in private spaces the actor is refused.\n          taskInReachFilter(this.db, workspaceId, actorId, isManager),\n'
b = '          // Both rules: this counted tasks in private spaces the actor is refused.\n          containerVisibilityFilter(this.db, actorId, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-13-the-ai-count-stops-at-the-project: applied")
