# The failure path silent again, so Status has one reachable value.
# Reddens: ai-activity-filters: "and leaves exactly one new failed row behind"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    await this.recordFailure(feature, 'none', ctx, 'not_configured', message)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai.service.ts: an unconfigured AI call 503s and writes nothing down.')
