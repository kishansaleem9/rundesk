# THE TASK IS NAMED, NOT READ: the chat route takes the task's id and puts nothing of the task into the model's context.
# Reddens only where a model answers: without one, no call reaches a model to be read.
# RE-AIMED 13 October: what the route reads past its stream's open is one try block deeper (`found-13-oct/a-refused-chat-turn-never-ends`).
# Reddens: brain-entry-points: "and the turn carries the task itself: its id goes to the server, and where a model answers, the task’s description is in what the model is given, with the task step in the trace"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = '      if (body.taskId) {\n        step(\'task\')\n'
b = '      if (body.taskId && Boolean(0)) {\n        step(\'task\')\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bep-17-the-task-is-named-not-read: the task is not read into the context')
