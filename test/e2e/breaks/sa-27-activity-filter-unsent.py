# The Activity page’s status filter is never sent.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "the Activity page lists runs and filters them by status"
import io
p = '/home/user/rundesk/apps/web/src/components/super-agents/super-agents-hub.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  if (status) query.set('status', status)\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-27-activity-filter-unsent: The Activity page’s status filter is never sent.')
