# A filter the query does not apply.
# Reddens: ai-activity-filters: "the failed row is absent from \"Succeeded\""
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '    if (opts.status) filters.push(eq(aiUsage.status, opts.status))\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: runLog accepts a status and ignores it.')
