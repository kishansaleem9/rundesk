# One reason for both providers — the i18n-fallback shape.
# Reddens: ai-model-picker: "each says WHY it cannot be used, naming its own provider"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/model-tiers.ts'
a = "    reasonKey: 'aiModels.reasonNoGoogleClient',"
b = "    reasonKey: 'aiModels.reasonNoOpenAiClient',"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('model-tiers.ts: Gemini now shows the OpenAI reason, so both rows say the same thing.')
