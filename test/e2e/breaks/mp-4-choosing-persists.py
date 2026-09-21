# Choosing and preferring conflated, so an idle experiment rewrites the default.
# Reddens: ai-model-picker: "and writes NOTHING — an idle experiment must not rewrite your default"
#
# THIS PATCH HAS TO BREAK BOTH PICKERS, and the first version broke neither.
# `ai-panel.tsx` renders the model list twice — "Best models" holds three rows
# and the other four sit behind "Show more" (§7 of the ledger says so), each
# with its own `onPick`. The 22-space anchor matched both, because the deeper
# copy's 28-space line contains it, so `== 1` refused and the patch never ran.
#
# Patching one would be worse than refusing. The check clicks a model; if it
# happens to click one from the list this patch left alone, the suite goes green
# against a defect that is right there in the file — a break that proves the
# opposite of what it claims. So: anchor from the newline to make indentation
# exact, assert BOTH are present, and conflate both.
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
pairs = (
    ('\n                      setTier(m.id)', '\n                      setTier(m.id)\n                      savePreference.mutate(m.id)'),
    ('\n                            setTier(m.id)', '\n                            setTier(m.id)\n                            savePreference.mutate(m.id)'),
)
s = io.open(p, encoding='utf-8').read()
for a, _ in pairs:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
for a, b in pairs:
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ai-panel.tsx: both model lists now persist the choice as a preference.')
