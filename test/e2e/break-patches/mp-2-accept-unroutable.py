# The preference write accepting a provider nothing can route to.
# Reddens: ai-model-picker: "storing \"openai\" as a preference is REFUSED"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    if (!isSelectableTier(preferredTier)) {'
b = '    if (false as boolean) {'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: setModelPreference stores any string, including "openai".')
