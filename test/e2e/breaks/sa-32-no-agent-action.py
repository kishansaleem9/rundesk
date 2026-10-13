# The Run a Super Agent action has no agent to pick.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "an Automation’s actions include Run a Super Agent, with the agents to pick from"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-automations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const agents = (agentsQuery.data ?? []).filter((a) => a.isActive)\n'
b = '  const agents = (agentsQuery.data ?? []).filter(() => false)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-32-no-agent-action: The Run a Super Agent action has no agent to pick.')
