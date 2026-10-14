# EVERY CALL OF THE WORKSPACE IS EACH AGENT'S: the cost is the month's use, not its own runs' calls.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) The calls are told apart by `ai_usage.agent_run_id`.
# Reddens: agent-performance: "an agent’s credits are its own runs’ calls this month — not last month’s, and not a call made outside its runs (read by SQL)"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(c, encoding='utf-8').read()
old = '(select coalesce(sum(u.credits), 0)::int from ai_usage u join super_agent_runs r on r.id = u.agent_run_id where r.agent_id = ${superAgents.id} and u.created_at >= ${since}::timestamptz)`,\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '(select coalesce(sum(u.credits), 0)::int from ai_usage u where u.workspace_id = ${superAgents.workspaceId} and u.created_at >= ${since}::timestamptz)`,\n')
io.open(c, 'w', encoding='utf-8').write(s)
print("agp-7-every-call-is-the-agents: every call of the workspace is each agent's")
