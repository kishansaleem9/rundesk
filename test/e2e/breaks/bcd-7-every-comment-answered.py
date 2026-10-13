# Brain answers every comment, named or not.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "a reply in the thread that does not name @Brain is not answered — each question names it, as in ClickUp"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/brain-comments.ts'
a = '    if (!BRAIN_MENTION.test(e.body)) return\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-7-every-comment-answered: Brain answers every comment, named or not.')
