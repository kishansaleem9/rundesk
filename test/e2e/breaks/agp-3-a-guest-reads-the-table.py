# A GUEST READS THE TABLE: only the workspace role is asked, and a guest is no agent-user.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) ClickUp keeps guests out of AI usage altogether.
# Reddens: agent-performance: "a guest is refused it in words (403)"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(c, encoding='utf-8').read()
old = '    const { isManager } = await this.assertMayUseAgents(workspaceId, actor.id)\n    const since = creditMonth(now).start.toISOString()\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '    const isManager = await isWorkspaceManager(this.db, workspaceId, actor.id)\n    const since = creditMonth(now).start.toISOString()\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-3-a-guest-reads-the-table: a guest reads the table')
