# Brain is never asked: a comment naming @Brain starts nothing.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "a comment naming @Brain is answered once, in that comment’s thread, by Brain — an agent’s account, on no roster"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
a = '    await this.brain.onComment(e)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-1-brain-never-answers: Brain is never asked: a comment naming @Brain starts nothing.')
