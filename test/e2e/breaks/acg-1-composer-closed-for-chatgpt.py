# THE COMPOSER STAYS CLOSED FOR CHATGPT WHERE CLAUDE HAS NO KEY.
# (`commit-log/log-39863ff-1`)
#
# The composer asks `/ai/status`, which speaks for Claude alone, whoever the
# turn is put to: on a server with a ChatGPT key and no Claude key, picking
# ChatGPT leaves the composer closed and "AI is not configured" on the page,
# though ChatGPT would answer.
#
# Reddens: ai-chatgpt-answers: "ChatGPT can be picked, and with it picked the composer is open — whether or not Claude has a key here"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "  const aiAvailable = chosenModel && chosenModel.provider !== 'anthropic' ? true : statusQuery.data?.available !== false\n"
b = "  const aiAvailable = statusQuery.data?.available !== false || !chosenModel\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the composer opens only where Claude has a key.')
