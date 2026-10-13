# A mention is answered by a new top-level comment, not in its thread.
# Reddens only where a model answers: every agent answers through the model, and the suite stops where none is configured.
# Reddens: super-agents: "the agent replies in the comment’s own thread, as itself, with its own answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/super-agents/super-agents.runner.ts'
s = io.open(p, encoding='utf-8').read()
a = "        reply: { kind: 'comment', taskId: e.taskId, parentCommentId: e.threadId },"
b = "        reply: { kind: 'comment', taskId: e.taskId, parentCommentId: '' },"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sa-6-the-reply-starts-a-thread: A mention is answered by a new top-level comment, not in its thread.')
