# CHATGPT CANNOT BE THE PREFERRED MODEL.
# (`commit-log/log-39863ff-1`)
#
# The preference write asks Claude's tiers alone, not this server's catalogue,
# so ChatGPT can be picked for a turn and never kept as the model a person
# prefers: "Set as my preferred model" is refused 400.
#
# Reddens: ai-chatgpt-answers: "ChatGPT, with its key, can be the preferred model, and a page opened afresh is on it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    if (!isSelectableTier(preferredTier, this.modelCatalog().models)) {'
b = '    if (!isSelectableTier(preferredTier)) {'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: only Claude\'s tiers can be stored as the preference.')
