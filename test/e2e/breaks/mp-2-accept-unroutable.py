# The preference write accepting a provider nothing can route to.
#
# RE-AIMED 14 October: ChatGPT routes where its key is set, so the provider
# nothing can route to is now the one with no key — Gemini, on the lanes and in
# CI (`commit-log/log-39863ff-1`). The write asks the server's own catalogue.
#
# Reddens: ai-model-picker: "storing \"gemini\", which this server has no key for, as a preference is REFUSED"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    if (!isSelectableTier(preferredTier, this.modelCatalog().models)) {'
b = '    if (false as boolean) {'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: setModelPreference stores any string, including "gemini" with no key.')
