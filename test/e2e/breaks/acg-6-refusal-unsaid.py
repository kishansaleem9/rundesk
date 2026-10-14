# CHATGPT'S REFUSAL IS NOT SAID.
# (`commit-log/log-39863ff-1`)
#
# A rate limit, a wrong key or a model it does not have ends the turn with "AI
# request failed", naming neither the provider nor what it said — the person
# cannot tell a full quota from a broken server.
#
# Reddens: ai-chatgpt-answers: "a refusal from ChatGPT ends the turn in its own words, and the run is written down as failed under its model"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/chat-providers.ts'
a = "      throw new ProviderFailed(res.status, `${name} answered ${res.status}${said ? `: ${said}` : ''}`)"
b = "      throw new ProviderFailed(res.status, 'AI request failed')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('chat-providers.ts: a provider refusal is "AI request failed".')
