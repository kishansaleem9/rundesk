# A STREAMED TOOL CALL LOSES ITS ARGUMENTS.
# (`commit-log/log-39863ff-1`)
#
# OpenAI streams a call's arguments in pieces after its name; the gatherer keeps
# the name and drops the pieces, so the call reaches the tool with no input and
# makes nothing — "make a list called X" answered with no list.
#
# Reddens: ai-chatgpt-answers: "asked to make a list, ChatGPT’s tool call makes it in the Space it named, the page is told, and ChatGPT is handed the result to finish its answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/chat-providers.ts'
a = "  if (piece.function?.arguments) slot.args += piece.function.arguments\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('chat-providers.ts: a tool call keeps its name and loses its arguments.')
