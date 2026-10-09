# THE CHAT CONTEXT NAMES EVERY SPACE AGAIN under "Workspace structure"; the command's stays clean.
# Reddens only where a model answers: run it on a lane with RUNDESK_LANE_MODEL set for that lane.
# Reddens: workspace-read-access: "the prompt a model is sent names, for a member, no space they are refused — the admin’s names it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '          .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false), spaceVisibilityFilter(this.db, userId, isManager)))\n'
b = '          .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-12-chat-names-refused-spaces: applied")
