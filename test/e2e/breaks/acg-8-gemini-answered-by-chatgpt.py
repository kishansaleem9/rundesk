# A GEMINI TURN IS ANSWERED BY CHATGPT.
# (`commit-log/log-39863ff-1`)
#
# With no Gemini key, a turn asking for Gemini is put to whichever other
# provider is set up — an answer from somebody other than the one named, sent to
# a company the person did not choose to send it to.
#
# Reddens: ai-chatgpt-answers: "a turn asking for Gemini, which has no key here, never reaches OpenAI’s address: Claude answers it, or nobody where Claude has no key either"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    const chosen = tierFor(tier, this.modelCatalog().models)\n    const model = chosen.model\n"
b = "    const chosen = tierFor(tier === 'gemini' ? 'chatgpt' : tier, this.modelCatalog().models)\n    const model = chosen.model\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a2 = "  isAvailable(tier?: string | null): boolean {\n    const chosen = tierFor(tier, this.modelCatalog().models)\n"
b2 = "  isAvailable(tier?: string | null): boolean {\n    const chosen = tierFor(tier === 'gemini' ? 'chatgpt' : tier, this.modelCatalog().models)\n"
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a2, b2))
print('ai.service.ts: a Gemini turn with no Gemini key goes to ChatGPT.')
