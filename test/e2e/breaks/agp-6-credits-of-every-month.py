# AN AGENT'S CREDITS ARE COUNTED FROM EVERY MONTH, not this month's.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "an agent’s credits are its own runs’ calls this month — not last month’s, and not a call made outside its runs (read by SQL)"
import io
c = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(c, encoding='utf-8').read()
old = 'where r.agent_id = ${superAgents.id} and u.created_at >= ${since}::timestamptz)`,\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, 'where r.agent_id = ${superAgents.id})`,\n')
io.open(c, 'w', encoding='utf-8').write(s)
print("agp-6-credits-of-every-month: an agent's credits are counted from every month, not this month's.")
