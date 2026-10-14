# AN ADMIN READS ONLY THE AGENTS THEY MADE: the table is narrowed to its reader for everyone.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) ClickUp shows an admin every agent of the workspace.
# Reddens: agent-performance: "an admin reads every Super Agent of the workspace, with the actions each completed this month and who made it"
#   or "the Credits tab draws My Agent Performance under the month’s credits: a row per agent with who made it, its actions, time saved, value, cost and return"
#   or "Settings → AI usage draws the same table under the credits card"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(c, encoding='utf-8').read()
old = '      .where(and(eq(superAgents.workspaceId, workspaceId), isManager ? undefined : eq(superAgents.createdById, actor.id)))\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '      .where(and(eq(superAgents.workspaceId, workspaceId), eq(superAgents.createdById, actor.id)))\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-2-an-admin-reads-only-their-own: an admin reads only the agents they made')
