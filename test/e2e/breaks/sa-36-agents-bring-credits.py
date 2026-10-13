# AN AGENT BRINGS A MEMBER'S CREDITS: the monthly allowance counts agents' accounts among the members it is per.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "an agent takes no member’s place: not in the plan’s member count, nor in the credits each member brings"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "        .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.role, 'guest'), eq(users.isAgent, false))),\n"
b = "        .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.role, 'guest'))),\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-36-agents-bring-credits: agents count toward the credits allowance')
