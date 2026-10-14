# EVERY MONTH IS THIS MONTH: an agent's runs and actions are counted since it was made.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) The table is the month's, as the credits are.
# Reddens: agent-performance: "a run refused before it began is not one of its runs, and last month’s runs are not this month’s"
#   or "an admin reads every Super Agent of the workspace, with the actions each completed this month and who made it"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(c, encoding='utf-8').read()
old = "        runs: sql<number>`(select count(*)::int from super_agent_runs r where r.agent_id = ${superAgents.id} and r.status <> 'skipped' and r.started_at >= ${since}::timestamptz)`,\n        actions: sql<number>`(select coalesce(sum(r.actions_completed), 0)::int from super_agent_runs r where r.agent_id = ${superAgents.id} and r.started_at >= ${since}::timestamptz)`,\n"
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, "        runs: sql<number>`(select count(*)::int from super_agent_runs r where r.agent_id = ${superAgents.id} and r.status <> 'skipped')`,\n        actions: sql<number>`(select coalesce(sum(r.actions_completed), 0)::int from super_agent_runs r where r.agent_id = ${superAgents.id})`,\n")
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-5-every-month-is-this-month: every month is this month')
