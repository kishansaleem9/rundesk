# Failed runs counted as work done — the regression 0150 could have caused.
# Reddens: ai-action-categories: "five failed runs move the Tasks tile by nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    const filters = [eq(aiUsage.status, 'succeeded')]"
b = '    const filters: any[] = []'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: usageSummary counts failed runs as if they were successes.')
