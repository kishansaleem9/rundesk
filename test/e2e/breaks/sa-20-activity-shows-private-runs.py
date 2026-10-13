# Activity lists the runs of private agents to everybody.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "a private agent’s runs are not in the Activity of somebody it is not shared with"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          eq(superAgentRuns.workspaceId, workspaceId),\n          this.visibleTo(actor.id),\n'
b = '          eq(superAgentRuns.workspaceId, workspaceId),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-20-activity-shows-private-runs: Activity lists the runs of private agents to everybody.')
