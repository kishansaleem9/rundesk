# Brain is asked before the author is checked: its own @Brain starts it again.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "Brain’s own words start nothing: an answer that names @Brain is not answered again"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
a = '    if (await this.isAgentAccount(e.authorId)) return\n    // @Brain, named in the comment, answers in its thread too (`ledger-rows/row-745`).\n    await this.brain.onComment(e)\n'
b = '    await this.brain.onComment(e)\n    if (await this.isAgentAccount(e.authorId)) return\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-8-brain-wakes-itself: Brain is asked before the author is checked: its own @Brain starts it again.')
