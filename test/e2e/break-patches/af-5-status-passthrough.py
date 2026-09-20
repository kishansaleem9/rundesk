# A typo in a query string answered with an empty list.
# Reddens: ai-activity-filters: "an unrecognised status is ignored rather than silently matching nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
a = "      status === 'succeeded' || status === 'failed' ? status : undefined"
b = '      (status as AiRunStatus | undefined) || undefined'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.controller.ts: any status string is passed straight through to the query.')
