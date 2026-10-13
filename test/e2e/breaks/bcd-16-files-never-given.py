# The files are read and then left out of the question.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "what the "+" gave the question reaches Brain: the task’s contents, the text file’s words under its name, and the image as an image"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = '      withComposerFiles(body.messages, files),\n'
b = '      withComposerFiles(body.messages, []),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-16-files-never-given: The files are read and then left out of the question.')
