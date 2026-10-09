# GENERATE SAYS NOTHING WHEN THE ASK IS REFUSED: no model answers, and the page shows no reason.
# (`found-30-sep/ai-page-fields-checked-only-by-a-unit`)
# Reddens only where no model answers
# Reddens: ai-generate-fields: "Generate says AI is not configured, and draws no answer to fill"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-ai-page.tsx'
a = ("    onError: (err) => toast.error(err instanceof Error ? err.message : t('ai.actionFailed')),\n"
     "    onSuccess: (data) => {\n"
     "      setResult({\n")
b = ("    onError: () => undefined, // BROKEN: a refusal is not said\n"
     "    onSuccess: (data) => {\n"
     "      setResult({\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-generate-fields-2-a-refusal-is-not-said: a refused Generate says nothing')
