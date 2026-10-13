# What the "+" points at is checked and never put in the turn.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "what the \"+\" gave the question reaches Brain: the task’s contents, the text file’s words under its name, and the image as an image"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = '      context = `${context}\\n\\n${focusText}`\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-15-focus-never-read: What the "+" points at is checked and never put in the turn.')
