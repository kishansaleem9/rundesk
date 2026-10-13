# A deleted agent stays a member of the workspace.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "deleting an agent removes it and its membership; its comments stay, authored by it"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      await tx\n        .delete(workspaceMembers)\n        .where(and(eq(workspaceMembers.workspaceId, agent.workspaceId), eq(workspaceMembers.userId, agent.userId)))\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-22-delete-keeps-the-membership: A deleted agent stays a member of the workspace.')
