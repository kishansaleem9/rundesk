# THE PROMPTS A MODEL IS SENT ASK THE SPACE AND THE PROJECT ONLY: chat's context and the command
# assistant's tasks name a private list's task. Measured on a lane with RUNDESK_LANE_MODEL; without
# a model the check reads the 503 and this patch cannot redden it.
# Reddens only where a model answers: run it on a lane with RUNDESK_LANE_MODEL set for that lane.
# (The line above is what the runner reads, `patches_needing_model`; this patch said so only in
# prose, so plan 3 ran it with no model and it reddened nothing, as the prose predicted.)
# Reddens: private-list-reach: "the prompts a model is sent name, for the member, nothing of the private list — the admin’s name it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      const taskInReach = taskInReachFilter(this.db, workspaceId, userId, isManager)\n'
b = '      const taskInReach = containerVisibilityFilter(this.db, userId, isManager)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '            eq(tasks.isArchived, false),\n            taskInReachFilter(this.db, workspaceId, actorId, isManager),\n            taskVisibilityFilter(this.db, actorId, isManager),\n'
b = '            eq(tasks.isArchived, false),\n            containerVisibilityFilter(this.db, actorId, isManager),\n            taskVisibilityFilter(this.db, actorId, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-16-the-prompts-stop-at-the-project: applied")
