# A preference is kept without its maker approving it.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "asked to remember, it keeps a preference waiting for approval; its recent work is remembered too"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = 'content: asked[1].slice(0, 500), approved: false, createdById: job.triggeredById'
b = 'content: asked[1].slice(0, 500), approved: true, createdById: job.triggeredById'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-13-preferences-kept-unasked: A preference is kept without its maker approving it.')
