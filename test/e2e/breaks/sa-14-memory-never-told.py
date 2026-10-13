# What an agent remembers is never put in front of it.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "an approved preference is in what it is told the next time it runs"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = "        memories.length ? `What you remember:\\n${memories.map((m) => `- (${m.kind}) ${m.content}`).join('\\n')}` : '',\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-14-memory-never-told: What an agent remembers is never put in front of it.')
