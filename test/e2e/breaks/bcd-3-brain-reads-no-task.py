# Brain is not told which task it was asked on.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "Brain answers from the task it was asked on: its words name it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = 'answering where you were @mentioned: a comment on the task “${turn.taskTitle}”.'
b = 'answering where you were @mentioned: a comment.'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-3-brain-reads-no-task: Brain is not told which task it was asked on.')
