# Asked inside a private list, Brain does not read that list.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "asked inside a private list, Brain reads that list’s own private work"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    if (here.listId && t.listId === here.listId) return true\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-6-asked-inside-private-unread: Asked inside a private list, Brain does not read that list.')
