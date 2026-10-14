# A TOOL'S RESULT NEVER REACHES CHATGPT.
# (`commit-log/log-39863ff-1`)
#
# The turn's `tool_result` blocks are left out when it is said in OpenAI's
# words, so ChatGPT is asked to go on with no answer to the call it made — the
# list is made, and the model is never told whether it was.
#
# Reddens: ai-chatgpt-answers: "asked to make a list, ChatGPT’s tool call makes it in the Space it named, the page is told, and ChatGPT is handed the result to finish its answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/chat-providers.ts'
a = "        out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: resultText(b.content) })\n"
b = "        void resultText\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('chat-providers.ts: tool results are dropped from the conversation sent to ChatGPT.')
