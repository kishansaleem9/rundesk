# WHAT THROWS PAST THE STREAM'S OPEN IS THROWN ON, to a hijacked reply that sends it nowhere
# (`found-13-oct/a-refused-chat-turn-never-ends`): the stream is neither told nor ended.
# Reddens: unit: apps/api/src/modules/ai/chat-trace.test.ts "ends the stream, and says so, when what it reads throws after it opened"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
s = io.open(c, encoding='utf-8').read()
a = '      endSseWithError(stream, err)\n'
b = '      throw err\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {c}, expected exactly 1'
io.open(c, 'w', encoding='utf-8').write(s.replace(a, b))
print('acr-u5-a-throw-past-the-open-unsaid: a throw past the open is thrown on')
