# EVERY MEMBER READS EVERY AGENT: the table is not narrowed to the agents a member made.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) ClickUp shows a member only the agents they made.
# Reddens: agent-performance: "a member reads only the Super Agents they made, and may not edit the benchmark"
#   or "a member’s card draws only the agents they made, says so, and offers no Edit benchmark"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(c, encoding='utf-8').read()
old = '      .where(and(eq(superAgents.workspaceId, workspaceId), isManager ? undefined : eq(superAgents.createdById, actor.id)))\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '      .where(and(eq(superAgents.workspaceId, workspaceId)))\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-1-every-member-reads-every-agent: every member reads every agent')
