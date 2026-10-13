# AGENTS AMONG THE PEOPLE A COMMENT MAY MENTION: the candidates read every member, agents' accounts and private agents' too.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "no agent is offered among the people a comment may mention — a private one least of all"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "          .where(and(eq(workspaceMembers.workspaceId, row.workspaceId), eq(users.isAgent, false)))\n"
b = "          .where(eq(workspaceMembers.workspaceId, row.workspaceId))\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-38-agents-among-the-people: mention candidates list agents')
