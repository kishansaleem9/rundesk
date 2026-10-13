# The roster lists agents among the people.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "a new agent is its own account — an agent, with no password, a member of the workspace — and is not on the people roster"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '.where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.isAgent, false)))'
b = '.where(eq(workspaceMembers.workspaceId, workspaceId))'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-2-agents-on-the-roster: The roster lists agents among the people.')
