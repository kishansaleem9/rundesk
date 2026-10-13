# No scheduled agent ever runs.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "its hour comes, it runs by itself — started by nobody — and DMs its maker the answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const due = await this.db.select().from(superAgents).where(eq(superAgents.isActive, true))\n'
b = '    const due: Agent[] = []\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-18-schedules-never-run: No scheduled agent ever runs.')
