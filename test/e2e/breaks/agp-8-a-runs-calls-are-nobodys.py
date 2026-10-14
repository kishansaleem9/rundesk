# A RUN'S CALLS ARE NOT WRITTEN AS ITS OWN: they go under the person it acted for, as before.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) An agent's cost could not be told from theirs.
# Reddens: agent-performance: "a run of the agent writes its calls as its own and counts what it carried out — and its row grows by that run, that action and those credits (read by SQL)"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(c, encoding='utf-8').read()
old = '        { workspaceId: agent.workspaceId, userId: actorId, agentRunId: run.id },\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '        { workspaceId: agent.workspaceId, userId: actorId },\n')
io.open(c, 'w', encoding='utf-8').write(s)
print("agp-8-a-runs-calls-are-nobodys: a run's calls are not written as its own")
