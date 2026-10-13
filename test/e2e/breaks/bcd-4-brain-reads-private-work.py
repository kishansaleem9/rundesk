# Brain draws on every task its asker may read, private or not.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "Brain draws on what is public in the workspace, and not on a private task its asker may read — its answer is read by everybody on the task"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    return this.listIsPublic(t.listId)\n'
b = '    return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-4-brain-reads-private-work: Brain draws on every task its asker may read, private or not.')
