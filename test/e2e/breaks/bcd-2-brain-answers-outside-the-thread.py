# Brain answers as a new top-level comment, not in the thread it was asked in.
# Reddens only where a model answers: Brain answers through the model, and where none is configured the suite reads the refusal instead.
# Reddens: brain-comments-and-decks: "a comment naming @Brain is answered once, in that comment’s thread, by Brain — an agent’s account, on no roster"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/brain-comments.ts'
a = 'await this.tasks.createComment(e.taskId, await this.account(), text, e.threadId, undefined, undefined, { actingForId: e.authorId })'
b = 'await this.tasks.createComment(e.taskId, await this.account(), text, undefined, undefined, undefined, { actingForId: e.authorId })'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-2-brain-answers-outside-the-thread: Brain answers as a new top-level comment, not in the thread it was asked in.')
