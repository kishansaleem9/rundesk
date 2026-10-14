# A CHATGPT TURN IS SENT TO CLAUDE.
# (`commit-log/log-39863ff-1`)
#
# The tier resolves to ChatGPT, and the turn goes to Anthropic's client all the
# same: the facade the picker's comments warn of — a stored choice, and an
# answer from somebody else (or, with no Claude key, none).
#
# Reddens: ai-chatgpt-answers: "the answer on the page is ChatGPT’s, streamed from OpenAI’s chat API, asked with the workspace’s own context"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "        const stream = other\n          ? streamChat("
b = "        const stream = (false as boolean) && other\n          ? streamChat("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: every turn goes to Claude, ChatGPT picked or not.')
