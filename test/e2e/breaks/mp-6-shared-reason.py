# The other provider's reason on Gemini's row — the i18n-fallback shape.
#
# RE-AIMED 14 October: each provider's reason now names its key, and Gemini's is
# the one the lanes and CI draw (`commit-log/log-39863ff-1`). Gemini's row says
# ChatGPT's reason: a sentence is there, naming the wrong thing.
#
# Reddens: ai-model-picker: "Gemini says WHY it cannot be used, naming its own key, and ChatGPT says who makes it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/model-tiers.ts'
a = "    unset: { id: 'gemini', label: 'Gemini', provider: 'google', reasonKey: 'aiModels.reasonGeminiNotSetUp' },"
b = "    unset: { id: 'gemini', label: 'Gemini', provider: 'google', reasonKey: 'aiModels.reasonChatGptNotSetUp' },"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('model-tiers.ts: Gemini now shows ChatGPT\'s reason.')
