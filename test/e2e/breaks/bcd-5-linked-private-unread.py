# A private task the comment links is not read.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "a private task the comment links, and its asker may read, is read — as ClickUp reads a linked private item"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/brain-comments.ts'
a = '  return { taskIds: [...new Set(taskIds)], docIds: [...new Set(docIds)] }'
b = '  return { taskIds: [], docIds: [] }'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-5-linked-private-unread: A private task the comment links is not read.')
