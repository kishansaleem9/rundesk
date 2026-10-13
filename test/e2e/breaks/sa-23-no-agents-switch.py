# The AI page has no Ask | Agents switch.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "Ask | Agents: All Agents lists the workspace’s agents the reader may see"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const agentsOffered = role !== 'guest'\n"
b = "  const agentsOffered = role === 'nobody'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-23-no-agents-switch: The AI page has no Ask | Agents switch.')
