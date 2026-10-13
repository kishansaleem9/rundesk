# Run agent shows the question it was asked, not the answer.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "Run agent on the profile answers on the page, from the agent the page is about"
import io
p = '/home/user/rundesk/apps/web/src/components/super-agents/super-agents-hub.tsx'
s = io.open(p, encoding='utf-8').read()
a = "            {lastRun.status === 'completed' ? lastRun.output : `${t(`superAgents.status.${lastRun.status}`)}: ${lastRun.error ?? ''}`}"
b = '            {lastRun.input}'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-25-run-shows-the-question: Run agent shows the question it was asked, not the answer.')
