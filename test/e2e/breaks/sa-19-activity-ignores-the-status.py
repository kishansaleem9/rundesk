# Activity’s status filter filters nothing.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "Activity filters by status and by “My agents”"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "          opts.status ? eq(superAgentRuns.status, opts.status as 'completed') : undefined,\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-19-activity-ignores-the-status: Activity’s status filter filters nothing.')
